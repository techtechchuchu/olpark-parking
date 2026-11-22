import { useSyncExternalStore } from 'react'
import { INITIAL_LOT_STATE, INITIAL_QUEUE_COUNT, LOTS, SHOWS, kstDate } from './data'
import type { Need } from './data'

export type LotState = { total: number; occupied: number; temp: number; onlineLimit: number }
export type QueueStatus = 'waiting' | 'ready' | 'called' | 'done' | 'cancelled' | 'expired'
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
}
export type Trip = { date: string; showId: string; arrive: string; origin: string; need: Need }
export type AppState = {
  lots: Record<string, LotState>
  queue: QueueItem[]
  trip: Trip
  updatedAt: number
}

const KEY = 'olpark-parking-demo-v5'
export const CALL_GRACE_MS = 5 * 60 * 1000

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

export function joinQueue(lotId: string, phone: string, vehicle: string, arrive: string, kind: Need = 'none', slot?: string): string | null {
  if (state.queue.some((q) => q.vehicle === vehicle && isActive(q))) {
    return '이 차량번호는 이미 다른 대기에 접수되어 있어요.'
  }
  if (activeQueue(state, lotId).length >= state.lots[lotId].onlineLimit) {
    return '이 주차장의 온라인 배정 한도가 가득 찼어요.'
  }
  const no = Math.max(0, ...state.queue.filter((q) => q.lotId === lotId).map((q) => q.no)) + 1
  commit({
    ...state,
    queue: [...state.queue, { no, lotId, phone, vehicle, arrive, status: 'waiting', mine: true, kind, slot }],
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

function expireCalls() {
  const now = Date.now()
  for (const q of state.queue) {
    if (q.status === 'called' && q.calledAt && now - q.calledAt > CALL_GRACE_MS) {
      cancelQueue(q.lotId, q.no, 'expired')
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
}
