// 실제 공공데이터 집계 (tools/build-history.mjs 가 만든 parking-data.json)
//  - 입출차: 2024년 7월 한 달, 공원 전체(동2문·남2문·북2문 합계). 주차구역 구분은 원본에 없다.
//  - 혼잡도: 공식 주차구역(P1A~P11)별 원활·혼잡·만차 기록.
import raw from './parking-data.json'

type Stat = { n: number; avg: number; median: number }
type Zone = { zone: string; counts: Record<string, number>; fullByHour: number[]; busyByHour: number[]; first: string; last: string; lastLevel: string; lastAt: string }
const P = raw.parklog as {
  source: string; scope: string; from: string; to: string; days: number; total: number
  daysByDow: number[]; entry: number[][]; exit: number[][]; present: number[][]; stay: Stat[]; stayAll: Stat; byDate: Record<string, number>
  presentByDate: Record<string, number[]>; maxPresent: number
}

// ---------- 도착 시각 혼잡 예측 ----------
// 방법(단순 통계, AI 아님): 2024년 7월 기록에서 "같은 요일 · 같은 시각에 주차 중이던 차량 수"를 날짜별로 모아 평균과 범위를 낸다.
// 방문일이 오늘이면, 지금 실시간 주차대수가 같은 요일·같은 시각의 과거 평균보다 얼마나 많은지(비율)로 보정한다.
export type Forecast = {
  dowName: string; hour: number; samples: number
  expected: number; low: number; high: number
  /** 2024년 7월 관측 최대 동시 주차대수 대비 비율(%) */
  percent: number; level: 'free' | 'normal' | 'busy'
  netPerHour: number // 그 시간대 평균 (입차 - 출차)
  observedMax: number
  adjust: { applied: boolean; ratio?: number; reason?: string }
  better: { hour: number; expected: number; diff: number } | null
}
export const FORECAST_LEVEL = { free: '여유', normal: '보통', busy: '혼잡' } as const

const kstNow = () => new Date(Date.now() + 9 * 3600 * 1000)
export const todayKst = () => kstNow().toISOString().slice(0, 10)

function sameDowValues(dow: number, hour: number) {
  return Object.entries(P.presentByDate)
    .filter(([d]) => new Date(d + 'T00:00:00Z').getUTCDay() === dow)
    .map(([, v]) => v[hour] ?? 0)
}
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)

/**
 * @param liveAdjusted 실시간 주차대수에서 기준치(장기주차 등 미출차 누적분)를 뺀 값. 없으면 null
 */
export function forecast(tripDate: string, arrive: string, showTime: string, liveAdjusted: number | null): Forecast | null {
  const dow = new Date(tripDate + 'T00:00:00Z').getUTCDay()
  const hour = Number(arrive.slice(0, 2))
  if (Number.isNaN(dow) || Number.isNaN(hour)) return null
  const vals = sameDowValues(dow, hour)
  if (!vals.length) return null

  // 오늘 방문이면 실시간 값으로 보정 (비율이 상식적인 범위일 때만)
  let adjust: Forecast['adjust'] = { applied: false, reason: tripDate === todayKst() ? '실시간 값을 아직 받지 못했어요' : '방문일이 오늘이 아니라 과거 기록만 사용' }
  let ratio = 1
  if (tripDate === todayKst() && liveAdjusted !== null) {
    const nowHour = kstNow().getUTCHours()
    const base = mean(sameDowValues(dow, nowHour))
    const r = base > 0 ? liveAdjusted / base : NaN
    if (hour < nowHour) adjust = { applied: false, reason: '도착 예정시간이 이미 지났어요' }
    else if (base < 100) adjust = { applied: false, reason: '지금은 주차 차량이 적은 시간대라 보정하지 않았어요' }
    else if (!(r >= 0.5 && r <= 2)) adjust = { applied: false, reason: '실시간 값이 과거 기록과 차이가 너무 커서 보정에 쓰지 않았어요' }
    else {
      ratio = r
      adjust = { applied: true, ratio: r }
    }
  }

  const at = (h: number) => mean(sameDowValues(dow, h)) * ratio
  const expected = Math.round(at(hour))
  const percent = Math.round((expected / P.maxPresent) * 100)
  // 공연 시작 전, 도착 예정보다 앞선 3시간 안에서 더 한산한 시각 찾기
  const showHour = Number(showTime.slice(0, 2)) || 23
  let better: Forecast['better'] = null
  for (let h = Math.max(7, hour - 3); h < Math.min(hour, showHour); h++) {
    const e = Math.round(at(h))
    if (e < expected * 0.9 && (!better || e < better.expected)) better = { hour: h, expected: e, diff: expected - e }
  }
  return {
    dowName: DAY_NAMES_KO[dow], hour, samples: vals.length,
    expected, low: Math.round(Math.min(...vals) * ratio), high: Math.round(Math.max(...vals) * ratio),
    percent, level: percent >= 70 ? 'busy' : percent >= 40 ? 'normal' : 'free',
    netPerHour: Math.round((P.entry[dow][hour] - P.exit[dow][hour]) / P.daysByDow[dow]),
    observedMax: P.maxPresent, adjust, better,
  }
}
const DAY_NAMES_KO = ['일', '월', '화', '수', '목', '금', '토']
const ZONES = raw.congestion.zones as Zone[]
export const SOURCES = { parklog: P.source, congestion: raw.congestion.source, monthly: raw.monthly.source }
export const PARKLOG = { from: P.from, to: P.to, days: P.days, total: P.total, scope: P.scope, maxPresent: P.maxPresent }

export type DowFilter = 'all' | 'weekday' | 'weekend' | 'same'
export type Filters = { dow: DowFilter; hour: number }
export const DEFAULT_FILTERS: Filters = { dow: 'all', hour: 17 }
export const DOW_LABEL: Record<DowFilter, string> = { all: '전체 요일', weekday: '평일(월~금)', weekend: '주말(토·일)', same: '방문 예정일과 같은 요일' }
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

export const HOURS = Array.from({ length: 17 }, (_, i) => i + 7) // 7시~23시

function dows(f: DowFilter, tripDate: string): number[] {
  if (f === 'weekday') return [1, 2, 3, 4, 5]
  if (f === 'weekend') return [0, 6]
  if (f === 'same') {
    const d = new Date(tripDate + 'T00:00:00Z').getUTCDay()
    return Number.isNaN(d) ? [0, 1, 2, 3, 4, 5, 6] : [d]
  }
  return [0, 1, 2, 3, 4, 5, 6]
}

export function analyze(f: Filters, tripDate: string) {
  const ds = dows(f.dow, tripDate)
  const days = ds.reduce((s, d) => s + P.daysByDow[d], 0)
  const perHour = (g: number[][]) => HOURS.map((h) => +(ds.reduce((s, d) => s + g[d][h], 0) / days).toFixed(1))
  const entry = perHour(P.entry), exit = perHour(P.exit), present = perHour(P.present)
  const records = ds.reduce((s, d) => s + P.entry[d].reduce((a, b) => a + b, 0), 0)
  // 체류시간: 요일별 통계를 건수로 가중 평균 (중앙값은 근사)
  const n = ds.reduce((s, d) => s + P.stay[d].n, 0)
  const stayAvg = Math.round(ds.reduce((s, d) => s + P.stay[d].avg * P.stay[d].n, 0) / n)
  const stayMedian = Math.round(ds.reduce((s, d) => s + P.stay[d].median * P.stay[d].n, 0) / n)
  const peak = (a: number[]) => { const h = HOURS[a.indexOf(Math.max(...a))]; return `${h}:00–${h + 1}:00` }
  const label = f.dow === 'same' && ds.length === 1 ? `${DAY_NAMES[ds[0]]}요일` : DOW_LABEL[f.dow]
  return {
    label, days, records, perDay: Math.round(records / days), entry, exit, present,
    stayAvg, stayMedian, entryPeak: peak(entry), exitPeak: peak(exit), presentPeak: peak(present),
    presentMax: Math.round(Math.max(...present)),
    entryAtHour: Math.round(entry[HOURS.indexOf(f.hour)] ?? 0),
    exitAtHour: Math.round(exit[HOURS.indexOf(f.hour)] ?? 0),
    presentAtHour: Math.round(present[HOURS.indexOf(f.hour)] ?? 0),
  }
}

export function filterSummary(f: Filters, tripDate: string) {
  return `2024년 7월 실제 입출차 기록 중 ${analyze(f, tripDate).label} 기준`
}

/** 공식 주차구역(P7 등)의 혼잡도 기록 요약. 기록이 없으면 null */
export function zoneStats(zone: string) {
  const z = ZONES.find((x) => x.zone === zone)
  if (!z) return null
  const total = Object.values(z.counts).reduce((a, b) => a + b, 0)
  const top = (arr: number[]) => arr.map((c, h) => ({ h, c })).filter((x) => x.c > 0).sort((a, b) => b.c - a.c).slice(0, 3).map((x) => `${x.h}시`)
  return {
    zone: z.zone, total,
    full: z.counts['만차'] ?? 0, busy: z.counts['혼잡'] ?? 0, free: z.counts['원활'] ?? 0,
    fullRatio: total ? Math.round(((z.counts['만차'] ?? 0) / total) * 100) : 0,
    fullHours: top(z.fullByHour), first: z.first, last: z.last, lastLevel: z.lastLevel, lastAt: z.lastAt.slice(0, 16),
  }
}
export const ALL_ZONES = ZONES.map((z) => z.zone)

export const MONTHLY = (raw.monthly.rows as { year: number; month: number; place: string; cars: number }[]).filter((r) => r.place === '올림픽공원')
