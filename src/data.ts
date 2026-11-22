// 공연과 주차장별 면수·잔여·요금은 시연용 예시 값입니다.
// 실제 데이터: 주차장 위치(OpenStreetMap), 과거 입출차 패턴·구역별 혼잡도 기록(history.ts), 공원 전체 실시간 주차대수(live.tsx).

export type Show = {
  id: string
  title: string
  genre: string
  date: string // YYYY-MM-DD
  time: string // HH:mm
  venue: string
  poster: { bg: string; fg: string; lines: string[]; sub: string }
}

// 시연용 공연은 항상 '다가오는' 날짜가 되도록 오늘(한국 시간) 기준으로 잡는다. 16시 이후에는 첫 공연을 내일로 넘긴다.
const kstNow = () => new Date(Date.now() + 9 * 3600 * 1000)
export const kstDate = (offsetDays = 0) => {
  const d = kstNow()
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}
const FIRST = kstNow().getUTCHours() >= 16 ? 1 : 0

export const SHOWS: Show[] = [
  {
    id: 's1',
    title: '그린 사운드 페스티벌',
    genre: '뮤직 페스티벌',
    date: kstDate(FIRST),
    time: '18:00',
    venue: '올림픽공원 야외무대',
    poster: { bg: 'linear-gradient(135deg,#7fdcaa,#58c98f)', fg: '#0b5a3c', lines: ['GREEN', 'SOUND'], sub: 'FESTIVAL' },
  },
  {
    id: 's2',
    title: '별빛 오케스트라',
    genre: '클래식 콘서트',
    date: kstDate(FIRST + 5),
    time: '19:30',
    venue: '올림픽홀',
    poster: { bg: 'linear-gradient(135deg,#1c2740,#111a2e)', fg: '#f3f1e8', lines: ['별빛', '오케스트라'], sub: 'STARLIGHT ORCHESTRA' },
  },
  {
    id: 's3',
    title: '서울 라이브 나이트',
    genre: '라이브 콘서트',
    date: kstDate(FIRST + 10),
    time: '19:00',
    venue: 'KSPO DOME',
    poster: { bg: 'linear-gradient(135deg,#f9d3dc,#f3b6c4)', fg: '#a3203f', lines: ['SEOUL', 'LIVE NIGHT'], sub: '2026 LIVE CONCERT' },
  },
]

/** 필요한 주차면 종류 */
export type Need = 'none' | 'disabled' | 'pregnant'
export const NEED_LABEL: Record<Need, string> = { none: '일반', disabled: '장애인 전용', pregnant: '임산부 배려' }
export const needCount = (l: { accessible: number; family: number }, need: Need) => (need === 'disabled' ? l.accessible : need === 'pregnant' ? l.family : 0)

export type LotInfo = {
  id: string
  /** 공식 주차구역 번호 (올림픽공원 주차 안내, "주차장 혼잡도 정보"의 주차구역 값) */
  zone: string
  /** 3D 지도에서 이 구역으로 칠할 OpenStreetMap 주차장 윤곽(way id). 지도에 윤곽이 없으면 빈 값 → 3D에는 이름표만 표시 */
  osm: string
  name: string
  area: string
  /** 3D 지도 좌표계 위치 (m, x=동쪽 z=북쪽). 도보 시간 추정과 이름표 위치에 쓴다 */
  x: number
  z: number
  /** 공식 가능 주차대수 */
  capacity: number
  capacityNote?: string
  /** 장애인 전용 / 임산부 배려 주차면 수. 공식 구역별 수치를 확인하지 못해 설치 비율(3%, 4%)로 잡은 예시 값 */
  accessible: number
  family: number
  hours: string
  fee: string
  map: { x: number; y: number }
}

// 구역 이름·가능 주차대수·요금·입차시간: 올림픽공원 공식 "주차 안내" (https://www.ksponco.or.kr/olympicpark/parkingInfo)
// 위치: 공식 주차 안내도의 P 표시를 3D 지도(OpenStreetMap 윤곽)에 대조해 옮긴 것. 안내도가 그림 지도라 수십 m 오차가 있을 수 있다.
const FEE = '소형 10분당 600원 · 일 최대 20,000원'
const HOURS = '입차 06:00~22:00'
const pin = (x: number, z: number) => ({ x: Math.round(((x + 700) / 1450) * 100), y: Math.round(((550 - z) / 1100) * 100) })
const lot = (id: string, zone: string, osm: string, area: string, x: number, z: number, capacity: number, capacityNote?: string): LotInfo => ({
  id, zone, osm, name: `${zone} 주차장`, area, x, z, capacity, capacityNote,
  accessible: Math.max(2, Math.round(capacity * 0.03)), family: Math.max(2, Math.round(capacity * 0.04)),
  hours: HOURS, fee: FEE, map: pin(x, z),
})
export const LOTS: LotInfo[] = [
  lot('p5', 'P5', '76425856', 'KSPO DOME 동쪽', 607, 58, 176),
  lot('p4', 'P4', '', '올림픽수영장 북쪽', 438, 379, 117),
  lot('p6', 'P6', '683545631', '핸드볼경기장 옆', 487, -167, 167),
  lot('p2', 'P2', '683545630', '올림픽홀 북쪽', 501, -295, 320, '올림픽홀 지하주차장 포함'),
  lot('p11', 'P11', '801847568', '테니스경기장 북쪽', 653, -259, 190),
  lot('p1b', 'P1B', '76425841', '올림픽홀 서쪽', 359, -365, 226, 'P1 전체 562대를 면적 비율로 나눈 추정'),
  lot('p1a', 'P1A', '76425891', '컨벤션센터 북쪽', 249, -401, 336, 'P1 전체 562대를 면적 비율로 나눈 추정'),
  lot('p7', 'P7', '', '우리금융아트홀 남쪽', 250, -274, 137),
]

// 공연 장소의 3D 지도 좌표 (도보 시간 추정용)
const VENUE_POS: Record<string, [number, number]> = {
  'KSPO DOME': [531, 82],
  올림픽홀: [538, -416],
  '올림픽공원 야외무대': [293, 60],
}
/** 직선거리 × 1.3 을 분당 75m 로 걷는다고 본 추정 도보 시간(분) */
export function walkMinutes(l: LotInfo, venue: string): number {
  const v = VENUE_POS[venue] ?? VENUE_POS['KSPO DOME']
  return Math.max(1, Math.round((Math.hypot(l.x - v[0], l.z - v[1]) * 1.3) / 75))
}
export type LotWithWalk = LotInfo & { walkMin: number }
export const withWalk = (l: LotInfo, venue: string): LotWithWalk => ({ ...l, walkMin: walkMinutes(l, venue) })
export const lotsFor = (venue: string): LotWithWalk[] => LOTS.map((l) => withWalk(l, venue))

export const lotById = (id: string) => LOTS.find((l) => l.id === id)
export const showById = (id: string) => SHOWS.find((s) => s.id === id) ?? SHOWS[0]

// 주차장별 점유·대기는 시연용 예시 (전체 면수만 공식 값)
const DEMO_OCCUPIED: Record<string, number> = { p5: 176, p4: 90, p6: 143, p2: 316, p11: 150, p1b: 226, p1a: 300, p7: 131 }
export const INITIAL_LOT_STATE: Record<string, { total: number; occupied: number; temp: number; onlineLimit: number }> = Object.fromEntries(
  LOTS.map((l) => [l.id, { total: l.capacity, occupied: DEMO_OCCUPIED[l.id] ?? 0, temp: 0, onlineLimit: Math.round(l.capacity / 10) }]),
)

export const INITIAL_QUEUE_COUNT: Record<string, number> = { p5: 3, p4: 0, p6: 2, p2: 3, p11: 1, p1b: 4, p1a: 0, p7: 1 }
