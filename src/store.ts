import { useSyncExternalStore } from 'react'
import { INITIAL_LOT_STATE, INITIAL_QUEUE_COUNT, LOTS, SHOWS, kstDate } from './data'
import type { Need } from './data'

export type LotState = { total: number; occupied: number; temp: number; onlineLimit: number }
export type QueueStatus = 'waiting' | 'ready' | 'called' | 'done' | 'cancelled' | 'expired' | 'noshow'
export type QueueItem = {
  no: number
  lotId: string
  /** 연락처(휴대전화). 로그인 없이 이 번호와 차량번호로 예약을 구분한다 */
  phone: string
  /** 차량번호 */
  vehicle: string
  arrive: string
  status: QueueStatus
  calledAt?: number
  mine?: boolean
  /** 예약한 주차면 종류 */
  kind?: Need
  /** 배치도에서 고른 자리 (예: B-7) */
  slot?: string
  /** 예약 시간(도착 예정 시각). 이 시각에서 HOLD_MS 가 지나도록 입차하지 않으면 노쇼 처리된다 */
  reservedAt?: number
  /** 예약 시간을 미룬 횟수 */
  postponed?: number
}
export type Trip = {
  date: string
  showId: string
  arrive: string
  origin: string
  need: Need
  /** 전용 주차면 이용 자격 인증 결과 (시연). 번호 전체는 저장하지 않고 끝 4자리만 둔다 */
  needProof?: { kind: Need; tail: string; at: number }
}
/** 인증까지 끝나 실제로 적용되는 주차면 종류. 인증 전에는 일반으로 취급한다 */
export const verifiedNeed = (t: Trip): Need => (t.need && t.need !== 'none' && t.needProof?.kind === t.need ? t.need : 'none')
export type AppState = {
  lots: Record<string, LotState>
  queue: QueueItem[]
  trip: Trip
  updatedAt: number
}

const KEY = 'olpark-parking-demo-v7'
// ---- 예약 규칙 ----
/** 예약 시간(또는 호출) 이후 자리를 잡아 두는 시간: 10분만 기다린다 */
export const HOLD_MS = 10 * 60 * 1000
export const CALL_GRACE_MS = HOLD_MS
/** 예약한 자리에 주차할 수 있는 최대 시간: 예약 시간부터 8시간 */
export const MAX_STAY_MS = 8 * 60 * 60 * 1000
/** 예약 접수 기간: 주차일 기준 이틀 전부터 하루 전까지 (당일 예약은 받지 않는다) */
export const BOOK_FROM_DAYS = 2
export const BOOK_UNTIL_DAYS = 1
/** 오늘(한국 시간) 기준으로 주차일까지 남은 날 수 */
export const daysUntil = (date: string) => Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(kstDate() + 'T00:00:00Z')) / 86400000)
export type BookingWindow = { open: boolean; reason: string; from: string; until: string }
/** 그 날짜의 주차를 지금 예약할 수 있는지와 접수 기간 */
export function bookingWindow(date: string): BookingWindow {
  const d = daysUntil(date)
  const shift = (n: number) => {
    const t = new Date(Date.parse(date + 'T00:00:00Z') - n * 86400000)
    return `${t.getUTCMonth() + 1}.${t.getUTCDate()}(${DAYS[t.getUTCDay()]})`
  }
  const from = shift(BOOK_FROM_DAYS), until = shift(BOOK_UNTIL_DAYS)
  if (Number.isNaN(d)) return { open: false, reason: '날짜를 확인해 주세요.', from, until }
  if (d > BOOK_FROM_DAYS) return { open: false, reason: `아직 예약 기간 전이에요. ${from}부터 예약할 수 있어요.`, from, until }
  if (d < BOOK_UNTIL_DAYS) return { open: false, reason: d === 0 ? '당일 예약은 받지 않아요. 예약되지 않은 자리는 일반 자리로 바뀌어 선착순으로 이용할 수 있어요.' : '이미 지난 날짜예요.', from, until }
  return { open: true, reason: '', from, until }
}

/** 한 번 미룰 때 늦춰지는 시간과 미룰 수 있는 횟수 */
export const POSTPONE_MS = 30 * 60 * 1000
export const MAX_POSTPONE = 1
/** 같은 전화번호로 노쇼가 이만큼 쌓이면 새 예약을 받지 않는다 */
export const NOSHOW_LIMIT = 2

/** 날짜(YYYY-MM-DD)와 시각(HH:mm)을 한국 시간 기준 시각 값으로 */
export const reservedAtOf = (date: string, time: string) => Date.parse(`${date}T${time}:00+09:00`)
const DAYS = ['일', '월', '화', '수', '목', '금', '토']
/** 11.23(월) 17:00 형태 (한국 시간) */
export function formatWhen(ts: number) {
  const d = new Date(ts + 9 * 3600 * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()}(${DAYS[d.getUTCDay()]}) ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}
/** 17:10 형태 (한국 시간) */
export function formatClock(ts: number) {
  const d = new Date(ts + 9 * 3600 * 1000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

const defaultTrip = (): Trip => ({ date: SHOWS[0].date, showId: SHOWS[0].id, arrive: '17:00', origin: '잠실역', need: 'none' })

function initialState(): AppState {
  const queue: QueueItem[] = []
  for (const lot of LOTS) {
    const n = LOTS.indexOf(lot) // 예시 대기자의 가짜 번호를 주차장마다 다르게
    for (let i = 0; i < INITIAL_QUEUE_COUNT[lot.id]; i++) {
      queue.push({
        no: i + 1,
        lotId: lot.id,
        phone: `010-0000-${String(1000 + n).slice(1)}${i}`,
        vehicle: `00가 ${String(1000 + n * 10 + i).padStart(4, '0')}`,
        arrive: '17:00',
        status: 'waiting',
        reservedAt: reservedAtOf(SHOWS[0].date, '17:00'),
      })
    }
  }
  return {
    lots: JSON.parse(JSON.stringify(INITIAL_LOT_STATE)),
    queue,
    trip: defaultTrip(),
    updatedAt: Date.now(),
  }
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AppState
      if (parsed.lots && parsed.queue && parsed.trip) {
        // 저장된 방문일이 지났거나 없는 공연이면 기본 공연으로 되돌린다
        if (parsed.trip.date < kstDate() || !SHOWS.some((s) => s.id === parsed.trip.showId)) parsed.trip = defaultTrip()
        if (!parsed.trip.need) parsed.trip.need = 'none'
        return parsed
      }
    }
  } catch {
    // 저장소를 쓸 수 없으면 메모리 상태로만 동작
  }
  return initialState()
}

let state: AppState = load()
const listeners = new Set<() => void>()

function commit(next: AppState) {
  state = { ...next, updatedAt: Date.now() }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // 무시
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

if (typeof window !== 'undefined') {
  // 다른 탭(관리자 화면)에서 바꾼 내용을 이용자 화면에 반영
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      state = load()
      listeners.forEach((l) => l())
    }
  })
  setInterval(expireCalls, 5000)
}

export function useApp(): AppState {
  return useSyncExternalStore(subscribe, () => state)
}

// ---- 계산 ----
export const remaining = (l: LotState) => Math.max(0, l.total - l.occupied - l.temp)
export const isActive = (q: QueueItem) => q.status === 'waiting' || q.status === 'ready' || q.status === 'called'
export const activeQueue = (s: AppState, lotId: string) => s.queue.filter((q) => q.lotId === lotId && isActive(q))

export type Level = 'free' | 'busy' | 'full'
export function level(l: LotState): Level {
  const r = remaining(l)
  if (r === 0) return 'full'
  if (r / l.total < 0.1) return 'busy'
  return 'free'
}
export const LEVEL_LABEL: Record<Level, string> = { free: '여유', busy: '혼잡', full: '만차' }

/** 단순 계산: 잔여면보다 앞선 대기 차량이 많으면 초과 1대당 7분 */
export function waitRange(l: LotState, ahead: number): [number, number] {
  const over = Math.max(0, ahead - remaining(l))
  const lo = over * 7
  return [lo, lo + 15]
}

// ---- 동작 ----
export function setTrip(trip: Trip) {
  commit({ ...state, trip })
}

export function resetAll() {
  commit(initialState())
}

export function releaseCar(lotId: string) {
  const l = state.lots[lotId]
  if (l.occupied <= 0) return
  commit({ ...state, lots: { ...state.lots, [lotId]: { ...l, occupied: l.occupied - 1 } } })
}

export function saveLotSettings(lotId: string, total: number, onlineLimit: number) {
  const l = state.lots[lotId]
  const t = Math.max(l.occupied + l.temp, Math.round(total))
  const o = Math.max(0, Math.min(t, Math.round(onlineLimit)))
  commit({ ...state, lots: { ...state.lots, [lotId]: { ...l, total: t, onlineLimit: o } } })
}

/** 입력한 전화번호·차량번호를 확인하고 표기를 맞춘다. 문제가 있으면 error 에 안내 문구 */
export function checkContact(phoneRaw: string, plateRaw: string): { error: string } | { phone: string; vehicle: string } {
  const digits = phoneRaw.replace(/\D/g, '')
  if (!/^01[016789]\d{7,8}$/.test(digits)) return { error: '휴대전화 번호를 확인해 주세요. (예: 010-1234-5678)' }
  const plate = plateRaw.replace(/\s/g, '')
  if (!/^\d{2,3}[가-힣]\d{4}$/.test(plate)) return { error: '차량번호를 확인해 주세요. (예: 12가 3456)' }
  const phone = digits.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3')
  return { phone, vehicle: plate.replace(/^(\d{2,3}[가-힣])(\d{4})$/, '$1 $2') }
}
/** 화면에 보여줄 때는 가운데 자리를 가린다: 010-****-5678 */
export const maskPhone = (p: string) => p.replace(/^(\d{3})-(\d{3,4})-(\d{4})$/, (_m, a: string, b: string, c: string) => `${a}-${'*'.repeat(b.length)}-${c}`)

export const noShowCount = (phone: string) => state.queue.filter((q) => q.phone === phone && q.status === 'noshow').length

export function joinQueue(lotId: string, phone: string, vehicle: string, arrive: string, kind: Need = 'none', slot?: string): string | null {
  if (state.queue.some((q) => q.vehicle === vehicle && isActive(q))) {
    return '이 차량번호는 이미 다른 대기에 접수되어 있어요.'
  }
  if (noShowCount(phone) >= NOSHOW_LIMIT) {
    return `이 번호는 미도착 취소가 ${NOSHOW_LIMIT}회 누적되어 지금은 예약할 수 없어요.`
  }
  const win = bookingWindow(state.trip.date)
  if (!win.open) return win.reason
  const reservedAt = reservedAtOf(state.trip.date, arrive)
  if (Number.isNaN(reservedAt) || reservedAt + HOLD_MS < Date.now()) {
    return '예약 시간이 이미 지났어요. 도착 예정시간을 다시 확인해 주세요.'
  }
  if (activeQueue(state, lotId).length >= state.lots[lotId].onlineLimit) {
    return '이 주차장의 온라인 배정 한도가 가득 찼어요.'
  }
  const no = Math.max(0, ...state.queue.filter((q) => q.lotId === lotId).map((q) => q.no)) + 1
  commit({
    ...state,
    queue: [...state.queue, { no, lotId, phone, vehicle, arrive, status: 'waiting', mine: true, kind, slot, reservedAt, postponed: 0 }],
  })
  return null
}

function patchQueue(lotId: string, no: number, fn: (q: QueueItem) => QueueItem, lotFn?: (l: LotState) => LotState) {
  const l = state.lots[lotId]
  commit({
    ...state,
    queue: state.queue.map((q) => (q.lotId === lotId && q.no === no ? fn(q) : q)),
    lots: lotFn ? { ...state.lots, [lotId]: lotFn(l) } : state.lots,
  })
}

export function advanceQueue(lotId: string, no: number): string | null {
  const q = state.queue.find((x) => x.lotId === lotId && x.no === no)
  if (!q) return null
  const first = activeQueue(state, lotId)[0]
  if (q.status === 'waiting') {
    if (first && first.no !== no) return '앞선 순서부터 처리해 주세요.'
    patchQueue(lotId, no, (x) => ({ ...x, status: 'ready' }))
  } else if (q.status === 'ready') {
    if (remaining(state.lots[lotId]) <= 0) return '일반 잔여면이 없어 호출할 수 없어요. 먼저 출차 처리를 해주세요.'
    patchQueue(
      lotId,
      no,
      (x) => ({ ...x, status: 'called', calledAt: Date.now() }),
      (l) => ({ ...l, temp: l.temp + 1 }),
    )
  } else if (q.status === 'called') {
    patchQueue(
      lotId,
      no,
      (x) => ({ ...x, status: 'done' }),
      (l) => ({ ...l, temp: Math.max(0, l.temp - 1), occupied: Math.min(l.total, l.occupied + 1) }),
    )
  }
  return null
}

export function cancelQueue(lotId: string, no: number, status: QueueStatus = 'cancelled') {
  const q = state.queue.find((x) => x.lotId === lotId && x.no === no)
  if (!q || !isActive(q)) return
  patchQueue(
    lotId,
    no,
    (x) => ({ ...x, status }),
    q.status === 'called' ? (l) => ({ ...l, temp: Math.max(0, l.temp - 1) }) : undefined,
  )
}

/** 예약 시간을 30분 미룬다 (1회). 자리 유지 시간이 끝나기 전까지만 가능 */
export function postponeQueue(lotId: string, no: number): string | null {
  const q = state.queue.find((x) => x.lotId === lotId && x.no === no)
  if (!q || !isActive(q) || !q.reservedAt) return '미룰 수 있는 예약이 아니에요.'
  if ((q.postponed ?? 0) >= MAX_POSTPONE) return `예약 시간은 ${MAX_POSTPONE}번만 미룰 수 있어요.`
  if (Date.now() > q.reservedAt + HOLD_MS) return '자리 유지 시간이 지나 미룰 수 없어요.'
  const next = q.reservedAt + POSTPONE_MS
  patchQueue(lotId, no, (x) => ({ ...x, reservedAt: next, postponed: (x.postponed ?? 0) + 1, arrive: formatClock(next) }))
  return null
}

/** 노쇼 처리: 예약을 끝내고 잡아 둔 자리를 돌려준다 */
export function markNoShow(lotId: string, no: number) {
  cancelQueue(lotId, no, 'noshow')
}

function expireCalls() {
  const now = Date.now()
  for (const q of state.queue) {
    if (!isActive(q)) continue
    if (q.status === 'called' && q.calledAt && now - q.calledAt > CALL_GRACE_MS) {
      cancelQueue(q.lotId, q.no, 'expired')
    } else if (q.reservedAt && now > q.reservedAt + HOLD_MS) {
      // 예약 시간에서 10분이 지나도록 입차하지 않으면 노쇼
      cancelQueue(q.lotId, q.no, 'noshow')
    }
  }
}

export const STATUS_LABEL: Record<QueueStatus, string> = {
  waiting: '대기 접수',
  ready: '입차 준비',
  called: '호출됨',
  done: '입차 완료',
  cancelled: '취소',
  expired: '호출 만료',
  noshow: '미도착 취소',
}
