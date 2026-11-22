import { useEffect, useState } from 'react'
import { NEED_LABEL, lotById } from './data'
import { CALL_GRACE_MS, HOLD_MS, MAX_POSTPONE, MAX_STAY_MS, NOSHOW_LIMIT, POSTPONE_MS, STATUS_LABEL, activeQueue, cancelQueue, fmtStay, formatClock, formatWhen, isActive, maskPhone, postponeQueue, stayMin, useApp } from './store'
import type { QueueItem } from './store'

const HOLD_MIN = HOLD_MS / 60000
const POSTPONE_MIN = POSTPONE_MS / 60000
const STAY_HOURS = MAX_STAY_MS / 3600000

/** 예약 규칙 안내 (예약하기 전에 보여준다) */
export function ReservePolicy() {
  return (
    <ul className="info-list small policy">
      <li>
        예약은 주차일 <b>이틀 전부터 하루 전까지</b>만 받아요.
      </li>
      <li>
        예약한 자리는 예약 시간부터 <b>최대 {STAY_HOURS}시간</b> 주차할 수 있어요.
      </li>
      <li>
        예약 시간에서 <b>{HOLD_MIN}분</b>이 지나도록 오지 않으면 예약이 취소돼요. <b>미루기</b>를 누르면 {POSTPONE_MIN}분까지 늦출 수 있어요 ({MAX_POSTPONE}번).
      </li>
      <li>예약되지 않은 자리는 당일에 일반 자리로 바뀌어요.</li>
      <li>오지 않아 취소된 예약이 {NOSHOW_LIMIT}번 쌓이면 그 번호로는 예약할 수 없어요.</li>
    </ul>
  )
}

function span(ms: number) {
  const m = Math.floor(ms / 60000)
  if (m >= 60 * 24) return `${Math.floor(m / 1440)}일 ${Math.floor((m % 1440) / 60)}시간`
  if (m >= 60) return `${Math.floor(m / 60)}시간 ${m % 60}분`
  if (m >= 1) return `${m}분`
  return `${Math.max(0, Math.floor(ms / 1000))}초`
}
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`

/** 내 예약 한 건: 예약 시간, 자리 유지 마감, 미루기·취소 */
export function Ticket({ q }: { q: QueueItem }) {
  const app = useApp()
  const [now, setNow] = useState(Date.now())
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const lot = lotById(q.lotId)
  const active = isActive(q)
  const ahead = activeQueue(app, q.lotId).filter((x) => x.no < q.no).length
  const holdUntil = q.reservedAt ? q.reservedAt + HOLD_MS : null
  const callLeft = q.calledAt ? Math.max(0, CALL_GRACE_MS - (now - q.calledAt)) : 0
  const canPostpone = active && !!q.reservedAt && (q.postponed ?? 0) < MAX_POSTPONE && now <= (holdUntil ?? 0)

  return (
    <section className={`panel ticket st-${q.status}`}>
      <div className="ticket-no">
        <span className="muted small">대기번호</span>
        <b>{String(q.no).padStart(3, '0')}</b>
      </div>
      <div className="ticket-body">
        <b>{lot?.name ?? '주차장'}</b>
        {q.reservedAt && (
          <span className="ticket-when">
            예약 시간 <b>{formatWhen(q.reservedAt)}</b>
            {(q.postponed ?? 0) > 0 && <span className="tag">{POSTPONE_MIN}분 미룸</span>}
          </span>
        )}
        {q.reservedAt && active && (
          <span className="small">
            주차 가능 {formatClock(q.reservedAt)} ~ {formatClock(q.reservedAt + MAX_STAY_MS)} (최대 {STAY_HOURS}시간)
          </span>
        )}
        {q.leave && stayMin(q.arrive, q.leave) && (
          <span className="small">
            나갈 예정 {q.leave} · 체류 약 {fmtStay(stayMin(q.arrive, q.leave)!)}
          </span>
        )}
        <span className="small">
          {q.vehicle} · {maskPhone(q.phone)}
          {q.slot && ' · 자리 ' + q.slot}
          {q.kind && q.kind !== 'none' && ` · ${NEED_LABEL[q.kind]} 주차면`}
        </span>
        <span className={`badge st-${q.status}`}>{STATUS_LABEL[q.status]}</span>

        {active && q.reservedAt && holdUntil && q.status !== 'called' && (
          <span className="small">
            {now < q.reservedAt ? (
              <>
                예약 시간까지 <b>{span(q.reservedAt - now)}</b> · {formatClock(holdUntil)}까지 자리 유지
              </>
            ) : (
              <span className="warn">
                예약 시간이 지났어요 · 자리 유지 <b>{mmss(Math.max(0, holdUntil - now))}</b> 남음
              </span>
            )}
          </span>
        )}
        {q.status === 'waiting' && <span className="small muted">내 앞 대기 {ahead}대</span>}
        {q.status === 'ready' && <span className="small">곧 호출됩니다. 주차장 근처로 이동해 주세요.</span>}
        {q.status === 'called' && (
          <span className="small accent">
            지금 입차하세요 · 남은 시간 <b>{mmss(callLeft)}</b>
          </span>
        )}
        {q.status === 'expired' && <span className="small">호출 후 {HOLD_MIN}분이 지나 주차면이 반환되었어요.</span>}
        {q.status === 'noshow' && <span className="small">예약 시간에서 {HOLD_MIN}분이 지나도록 오지 않아 예약이 취소됐어요. 자리는 일반 자리로 바뀌었어요.</span>}
        {msg && <span className="error small">{msg}</span>}
      </div>
      {active && (
        <div className="ticket-actions">
          {canPostpone && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setMsg(postponeQueue(q.lotId, q.no))}>
              {POSTPONE_MIN}분 미루기
            </button>
          )}
          <button type="button" className="btn btn-outline btn-sm" onClick={() => cancelQueue(q.lotId, q.no)}>
            예약 취소
          </button>
        </div>
      )}
    </section>
  )
}
