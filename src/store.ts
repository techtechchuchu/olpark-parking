import { useSyncExternalStore } from 'react'
import { INITIAL_LOT_STATE, INITIAL_QUEUE_COUNT, LOTS, SHOWS, kstDate } from './data'

export type LotState = { total: number; occupied: number; temp: number; onlineLimit: number }
export type QueueStatus = 'waiting' | 'ready' | 'called' | 'done' | 'cancelled' | 'expired'
export type QueueItem = {
  no: number
  lotId: string
  nick: string
  vehicle: string
  arrive: string
  status: QueueStatus
  calledAt?: number
  mine?: boolean
}
export type Trip = { date: string; showId: string; arrive: string; origin: string }
export type AppState = {
  lots: Record<string, LotState>
  queue: QueueItem[]
  trip: Trip
  updatedAt: number
}

const KEY = 'olpark-parking-demo-v4'
export const CALL_GRACE_MS = 5 * 60 * 1000

const defaultTrip = (): Trip => ({ date: SHOWS[0].date, showId: SHOWS[0].id, arrive: '17:00', origin: '잠실역' })

function initialState(): AppState {
  const queue: QueueItem[] = []
  for (const lot of LOTS) {
    for (let i = 0; i < INITIAL_QUEUE_COUNT[lot.id]; i++) {
      queue.push({
        no: i + 1,
        lotId: lot.id,
        nick: `관람객 ${i + 1}`,
        vehicle: `DEMO-${lot.id}-${i}`,
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

export function joinQueue(lotId: string, nick: string, vehicle: string, arrive: string): string | null {
  if (state.queue.some((q) => q.vehicle === vehicle && isActive(q))) {
    return '이 시연용 차량은 이미 다른 대기에 접수되어 있어요.'
  }
  if (activeQueue(state, lotId).length >= state.lots[lotId].onlineLimit) {
    return '이 주차장의 온라인 배정 한도가 가득 찼어요.'
  }
  const no = Math.max(0, ...state.queue.filter((q) => q.lotId === lotId).map((q) => q.no)) + 1
  commit({
    ...state,
    queue: [...state.queue, { no, lotId, nick, vehicle, arrive, status: 'waiting', mine: true }],
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
