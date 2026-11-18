import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LOTS, lotById } from '../data'
import { CALL_GRACE_MS, STATUS_LABEL, activeQueue, cancelQueue, isActive, joinQueue, useApp } from '../store'

export default function Queue() {
  const app = useApp()
  const [params] = useSearchParams()
  const [lotId, setLotId] = useState(lotById(params.get('lot') ?? '')?.id ?? LOTS[0].id)
  const [nick, setNick] = useState('')
  const [arrive, setArrive] = useState(app.trip.arrive)
  const [vehicle, setVehicle] = useState('DEMO-1234')
  const [error, setError] = useState<string | null>(null)
  const [, tick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const v = vehicle.trim().toUpperCase()
    if (!/^DEMO-[A-Z0-9-]{1,12}$/.test(v)) {
      setError('시연용 식별번호는 DEMO-로 시작해야 해요. (예: DEMO-1234)')
      return
    }
    setError(joinQueue(lotId, nick.trim() || '관람객', v, arrive))
  }

  const mine = app.queue.filter((q) => q.mine).reverse()

  return (
    <div className="container section narrow">
      <p className="eyebrow">MY PARKING PASS</p>
      <h1 className="page-title">내 온라인 대기</h1>
      <p className="muted">대기번호를 받고, 출발 전 상태를 확인하세요.</p>

      <section className="panel">
        <h3>온라인 대기 신청</h3>
        <form className="stack-form" onSubmit={submit}>
          <label>
            <span>주차장</span>
            <select value={lotId} onChange={(e) => setLotId(e.target.value)}>
              {LOTS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>닉네임</span>
            <input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="예: 올팍러버" maxLength={12} />
          </label>
          <label>
            <span>도착 가능시간</span>
            <input type="time" value={arrive} onChange={(e) => setArrive(e.target.value)} required />
          </label>
          <label>
            <span>시연용 차량 식별번호</span>
            <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="DEMO-1234" maxLength={17} />
          </label>
          <p className="warn small">실제 전화번호나 차량번호를 입력하지 마세요.</p>
          <p className="muted small">동일한 시연용 차량은 한 주차장에만 대기할 수 있습니다. 대기 접수는 주차 공간 확보가 아닙니다.</p>
          {error && <p className="error small">{error}</p>}
          <button className="btn btn-primary" type="submit">
            시연 대기번호 받기
          </button>
        </form>
      </section>

      {mine.length === 0 ? (
        <section className="panel empty">
          <b>아직 발급된 대기번호가 없어요</b>
          <p className="muted small">신청한 대기 상태는 이 브라우저에서 저장됩니다.</p>
        </section>
      ) : (
        mine.map((q) => {
          const lot = lotById(q.lotId)!
          const ahead = activeQueue(app, q.lotId).filter((x) => x.no < q.no).length
          const left = q.calledAt ? Math.max(0, CALL_GRACE_MS - (Date.now() - q.calledAt)) : 0
          return (
            <section key={q.lotId + q.no} className={`panel ticket st-${q.status}`}>
              <div className="ticket-no">
                <span className="muted small">대기번호</span>
                <b>{String(q.no).padStart(3, '0')}</b>
              </div>
              <div className="ticket-body">
                <b>{lot.name}</b>
                <span className="small">
                  {q.nick} · {q.vehicle} · 도착 가능 {q.arrive}
                </span>
                <span className={`badge st-${q.status}`}>{STATUS_LABEL[q.status]}</span>
                {q.status === 'waiting' && <span className="small">내 앞 대기 {ahead}대</span>}
                {q.status === 'ready' && <span className="small">곧 호출됩니다. 주차장 근처로 이동해 주세요.</span>}
                {q.status === 'called' && (
                  <span className="small accent">
                    지금 입차하세요 · 남은 시간 {Math.floor(left / 60000)}:{String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}
                  </span>
                )}
                {q.status === 'expired' && <span className="small">5분 유예가 지나 주차면이 반환되었어요.</span>}
              </div>
              {isActive(q) && (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => cancelQueue(q.lotId, q.no)}>
                  대기 취소
                </button>
              )}
            </section>
          )
        })
      )}
    </div>
  )
}
