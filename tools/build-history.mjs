// 공공데이터포털 파일데이터(CSV) 3종을 화면에서 쓰는 작은 집계 파일로 만든다.
// 사용: node tools/build-history.mjs   (입력: data-raw/*.csv, 출력: src/parking-data.json)
//  - parklog-202407.csv    한국체육산업개발_올림픽공원 입출차 정보 (2024년 7월, 입차일·입차일시·출차일시)
//  - congestion-*.csv      한국체육산업개발_주차장 혼잡도 정보 (주차구역·혼잡도·등록일·등록시간)
//  - monthly-*.csv         한국체육산업개발_월별주차현황 (연도·월·주차장소·주차대수)
import fs from 'node:fs'

const read = (f) => new TextDecoder('euc-kr').decode(fs.readFileSync(new URL(`../data-raw/${f}`, import.meta.url)))
const rows = (text) =>
  text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(1)
    .map((l) => l.split(',').map((c) => c.replace(/^"|"$/g, '').trim()))
const stamp = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(v)
  if (!m) return null
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  return { date: `${m[1]}-${m[2]}-${m[3]}`, dow: new Date(utc).getUTCDay(), hour: +m[4], min: utc / 60000 }
}
const grid = () => Array.from({ length: 7 }, () => Array(24).fill(0))

// ---- 입출차 ----
const entry = grid(), exit = grid() // [요일 0=일][시] 건수
const present = grid() // [요일][시] 그 시각 정각에 주차 중이던 차량 수의 합 (날짜 수로 나누면 평균)
const stayByDow = Array.from({ length: 7 }, () => []) // 체류시간(분)
const byDate = {}
const presentByDate = {} // 'YYYY-MM-DD' -> [24] 그 날 각 정각에 주차 중이던 차량 수
let total = 0, noExit = 0, bad = 0
for (const [, tin, tout] of rows(read('parklog-202407.csv'))) {
  const a = stamp(tin)
  if (!a) { bad++; continue }
  total++
  entry[a.dow][a.hour]++
  byDate[a.date] = (byDate[a.date] ?? 0) + 1
  const b = stamp(tout ?? '')
  if (!b || b.min < a.min) { noExit++; continue }
  exit[b.dow][b.hour]++
  const stay = b.min - a.min
  if (stay <= 60 * 24 * 2) stayByDow[a.dow].push(stay)
  // 주차 중이던 정각들을 센다 (이틀 넘는 장기주차는 제외)
  if (stay <= 60 * 24 * 2) {
    for (let t = Math.ceil(a.min / 60) * 60; t <= b.min; t += 60) {
      const d = new Date(t * 60000)
      present[d.getUTCDay()][d.getUTCHours()]++
      const key = d.toISOString().slice(0, 10)
      ;(presentByDate[key] ??= Array(24).fill(0))[d.getUTCHours()]++
    }
  }
}
const dates = Object.keys(byDate).sort()
const daysByDow = Array(7).fill(0)
for (const d of dates) daysByDow[new Date(d + 'T00:00:00Z').getUTCDay()]++
const stat = (arr) => {
  if (!arr.length) return { n: 0, avg: 0, median: 0 }
  const s = [...arr].sort((x, y) => x - y)
  return { n: s.length, avg: Math.round(s.reduce((x, y) => x + y, 0) / s.length), median: s[Math.floor(s.length / 2)] }
}

// ---- 혼잡도 ----
const zones = {}
for (const [, , zone, levelRaw, date, time] of rows(read(fs.readdirSync(new URL('../data-raw/', import.meta.url)).find((f) => f.startsWith('congestion'))))) {
  if (!zone) continue
  const z = (zones[zone] ??= { zone, counts: {}, fullByHour: Array(24).fill(0), busyByHour: Array(24).fill(0), first: date, last: date, lastLevel: levelRaw, lastAt: `${date} ${time}` })
  z.counts[levelRaw] = (z.counts[levelRaw] ?? 0) + 1
  const h = Number(String(time).slice(0, 2))
  if (levelRaw === '만차' && h >= 0 && h < 24) z.fullByHour[h]++
  if (levelRaw === '혼잡' && h >= 0 && h < 24) z.busyByHour[h]++
  if (date < z.first) z.first = date
  if (`${date} ${time}` > z.lastAt) { z.last = date; z.lastAt = `${date} ${time}`; z.lastLevel = levelRaw }
}

// ---- 월별 ----
const monthly = rows(read(fs.readdirSync(new URL('../data-raw/', import.meta.url)).find((f) => f.startsWith('monthly')))).map(([year, month, place, cars]) => ({ year: +year, month: parseInt(month, 10), place, cars: +cars }))

const out = {
  parklog: {
    source: '한국체육산업개발주식회사_올림픽공원 입출차 정보 (공공데이터포털 파일데이터, 2024년 7월)',
    scope: '올림픽공원 동2문·남2문·북2문 주차구역 합계 (구역 구분 없음)',
    from: dates[0], to: dates[dates.length - 1], days: dates.length, total, noExit, bad,
    daysByDow, entry, exit, present,
    stay: stayByDow.map(stat), stayAll: stat(stayByDow.flat()),
    byDate,
    presentByDate: Object.fromEntries(dates.map((d) => [d, presentByDate[d] ?? Array(24).fill(0)])),
    maxPresent: Math.max(...dates.flatMap((d) => presentByDate[d] ?? [0])),
  },
  congestion: {
    source: '한국체육산업개발주식회사_주차장 혼잡도 정보 (공공데이터포털 파일데이터)',
    zones: Object.values(zones).sort((a, b) => a.zone.localeCompare(b.zone, 'ko', { numeric: true })),
  },
  monthly: { source: '한국체육산업개발주식회사_월별주차현황 (공공데이터포털 파일데이터)', rows: monthly },
}
fs.writeFileSync(new URL('../src/parking-data.json', import.meta.url), JSON.stringify(out))

const p = out.parklog
console.log(`입출차 ${p.total}건 (${p.from}~${p.to}, ${p.days}일), 출차 없음/이상 ${p.noExit}, 형식 오류 ${p.bad}`)
console.log('요일별 날짜 수(일~토)', p.daysByDow.join(' '), '| 체류 평균/중앙', p.stayAll.avg, p.stayAll.median)
const avgHour = (g) => Array.from({ length: 24 }, (_, h) => Math.round(g.reduce((s, r) => s + r[h], 0) / p.days))
console.log('시간대별 하루 평균 입차', avgHour(p.entry).join(' '))
console.log('시간대별 평균 주차 중 차량', avgHour(p.present).join(' '))
console.log('관측 최대 동시 주차', p.maxPresent)
console.log('하루 입차 최소/최대', Math.min(...Object.values(p.byDate)), Math.max(...Object.values(p.byDate)))
console.log('혼잡도 구역', out.congestion.zones.map((z) => `${z.zone}:${JSON.stringify(z.counts)} ${z.first}~${z.last}`).join('\n  '))
console.log('월별', monthly.length, '행', [...new Set(monthly.map((m) => m.place))].join(','), [...new Set(monthly.map((m) => m.year))].join(','))
