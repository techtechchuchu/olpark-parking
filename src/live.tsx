import { useSyncExternalStore } from 'react'

// 실제 공공데이터: 한국체육산업개발 "올림픽공원 실시간 주차현황" (서버 프록시 /api/parking 경유)
// 이 API 는 동2문·남2문·북2문 합계 주차대수 하나만 제공한다. 주차장별 잔여면은 제공하지 않는다.
export type LiveParking =
  | { status: 'loading' }
  | { status: 'ok'; parkingSum: number; baseline: number; fetchedAt: string; source: string }
  | { status: 'error' }

const POLL_MS = 60_000
let state: LiveParking = { status: 'loading' }
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

async function load() {
  try {
    const r = await fetch('/api/parking')
    const j = await r.json()
    state = j.ok && typeof j.parkingSum === 'number' ? { status: 'ok', parkingSum: j.parkingSum, baseline: Number(j.baseline) || 0, fetchedAt: j.fetchedAt, source: j.source } : { status: 'error' }
  } catch {
    state = { status: 'error' }
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  if (!timer) {
    load()
    timer = setInterval(load, POLL_MS)
  }
  return () => {
    listeners.delete(l)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

export function useLiveParking(): LiveParking {
  return useSyncExternalStore(subscribe, () => state)
}

export function LiveParkingBar() {
  const live = useLiveParking()
  if (live.status === 'loading') return <p className="live-bar muted small">실시간 주차현황을 불러오는 중…</p>
  if (live.status === 'error') return <p className="live-bar muted small">실시간 주차현황을 지금은 불러오지 못했어요. 잠시 후 자동으로 다시 시도합니다.</p>
  const time = new Date(live.fetchedAt).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
  return (
    <p className="live-bar small">
      <span className="live-dot" aria-hidden /> <b>실시간</b> 올림픽공원 전체 주차 <b className="accent">{live.parkingSum.toLocaleString()}대</b>
      <span className="muted">
        {' '}
        · {time} 기준 · 동2문·남2문·북2문 합계 · 출처: {live.source}
      </span>
    </p>
  )
}
