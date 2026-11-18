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

export const SHOWS: Show[] = [
  {
    id: 's1',
    title: '그린 사운드 페스티벌',
    genre: '뮤직 페스티벌',
    date: '2026-11-21',
    time: '18:00',
    venue: '올림픽공원 야외무대',
    poster: { bg: 'linear-gradient(135deg,#7fdcaa,#58c98f)', fg: '#0b5a3c', lines: ['GREEN', 'SOUND'], sub: 'FESTIVAL' },
  },
  {
    id: 's2',
    title: '별빛 오케스트라',
    genre: '클래식 콘서트',
    date: '2026-11-27',
    time: '19:30',
    venue: '올림픽홀',
    poster: { bg: 'linear-gradient(135deg,#1c2740,#111a2e)', fg: '#f3f1e8', lines: ['별빛', '오케스트라'], sub: 'STARLIGHT ORCHESTRA' },
  },
  {
    id: 's3',
    title: '서울 라이브 나이트',
    genre: '라이브 콘서트',
    date: '2026-12-01',
    time: '19:00',
    venue: 'KSPO DOME',
    poster: { bg: 'linear-gradient(135deg,#f9d3dc,#f3b6c4)', fg: '#a3203f', lines: ['SEOUL', 'LIVE NIGHT'], sub: '2026 LIVE CONCERT' },
  },
]

export type LotInfo = {
  id: string
  /** 공식 주차구역 번호 (한국체육산업개발 "주차장 혼잡도 정보"의 주차구역 값) */
  zone: string
  /** OpenStreetMap way id. 3D 지도에서 같은 주차장을 찾는 데 쓴다 */
  osm: string
  name: string
  area: string
  walkMin: number
  hours: string
  fee: string
  map: { x: number; y: number }
}

// 위치는 OpenStreetMap 의 "올림픽공원 주차장N" 윤곽이고, 같은 번호의 공식 구역(PN)으로 보고 혼잡도 기록을 연결했다.
// (번호가 같다는 가정이므로, 기관의 주차장 안내도로 한 번 대조할 필요가 있음)
export const LOTS: LotInfo[] = [
  {
    id: 'p9',
    zone: 'P9',
    osm: '683545631',
    name: 'P9 주차장',
    area: '핸드볼경기장 옆',
    walkMin: 4,
    hours: '07:00–23:00',
    fee: '10분당 500원 · 일 최대 20,000원',
    map: { x: 82, y: 65 },
  },
  {
    id: 'p8',
    zone: 'P8',
    osm: '683545630',
    name: 'P8 주차장',
    area: '올림픽홀 북쪽',
    walkMin: 6,
    hours: '07:00–23:00',
    fee: '10분당 500원 · 일 최대 20,000원',
    map: { x: 83, y: 77 },
  },
  {
    id: 'p7',
    zone: 'P7',
    osm: '76425841',
    name: 'P7 주차장',
    area: '컨벤션센터 북쪽',
    walkMin: 8,
    hours: '07:00–23:00',
    fee: '10분당 500원 · 일 최대 20,000원',
    map: { x: 73, y: 83 },
  },
]

export const lotById = (id: string) => LOTS.find((l) => l.id === id)
export const showById = (id: string) => SHOWS.find((s) => s.id === id) ?? SHOWS[0]

export const INITIAL_LOT_STATE = {
  p9: { total: 120, occupied: 96, temp: 0, onlineLimit: 12 },
  p8: { total: 180, occupied: 176, temp: 0, onlineLimit: 15 },
  p7: { total: 220, occupied: 220, temp: 0, onlineLimit: 20 },
} as const

export const INITIAL_QUEUE_COUNT: Record<string, number> = { p9: 2, p8: 3, p7: 4 }
