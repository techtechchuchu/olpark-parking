import { useEffect, useState, useSyncExternalStore } from 'react'
import { FORECAST_LEVEL, PARKLOG } from './history'

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

/** 숫자가 0에서 목표값까지 한 번 올라간다. 움직임 줄이기 설정이면 바로 목표값 */
function useCountUp(target: number, ms = 900) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setN(target)
      return
    }
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      setN(Math.round(target * (1 - (1 - k) ** 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return n
}

/** 지금 주차대수를 과거 관측 최대와 견준 등급. 기준(40%·70%)은 혼잡 예측(history.ts)과 같다 */
export function liveLevel(cars: number): 'free' | 'normal' | 'busy' {
  const percent = (cars / PARKLOG.maxPresent) * 100
  return percent >= 70 ? 'busy' : percent >= 40 ? 'normal' : 'free'
}
const LIVE_TEXT = { free: '지금 한산해요', normal: '지금 붐비기 시작했어요', busy: '지금 많이 붐벼요' }

function LiveCount({ cars }: { cars: number }) {
  const n = useCountUp(cars)
  const level = liveLevel(cars)
  return (
    <p className="live-line" aria-label={`${LIVE_TEXT[level]}. 올림픽공원에 약 ${cars.toLocaleString()}대 주차 중 (실시간)`}>
      <span className={`live-dot lv-${level}`} aria-hidden />
      <b title={FORECAST_LEVEL[level]}>{LIVE_TEXT[level]}</b>
      <span aria-hidden>·</span> 약 <b className="accent live-num">{n.toLocaleString()}대</b> 주차 중
      <span className="tag tag-real">실시간</span>
    </p>
  )
}

/** 첫 화면용 한 줄 요약: 등급을 먼저 말하고 숫자를 뒤에 둔다 */
export function LiveLine() {
  const live = useLiveParking()
  if (live.status !== 'ok') return <p className="live-line muted small">{live.status === 'loading' ? '실시간 주차 현황을 불러오는 중…' : '실시간 주차 현황은 잠시 후 다시 시도해요.'}</p>
  return <LiveCount cars={Math.max(0, live.parkingSum - live.baseline)} />
}

export function LiveParkingBar() {
  const live = useLiveParking()
  if (live.status === 'loading') return <p className="live-bar muted small">실시간 주차현황을 불러오는 중…</p>
  if (live.status === 'error') return <p className="live-bar muted small">실시간 주차현황을 지금은 불러오지 못했어요. 잠시 후 자동으로 다시 시도합니다.</p>
  const time = new Date(live.fetchedAt).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
  return (
    <p className="live-bar small">
      <span className="live-dot" aria-hidden /> <b>실시간</b> 지금 공원에 주차 중 <b className="accent">약 {Math.max(0, live.parkingSum - live.baseline).toLocaleString()}대</b>
      <span className="muted">
        {' '}
        · {time} 기준 · 기관 API 값 {live.parkingSum.toLocaleString()}대에서 출차 기록이 없는 장기주차 누적 추정 {live.baseline.toLocaleString()}대를 뺀 값 · 출처: {live.source}
      </span>
    </p>
  )
}
