import { useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LOTS, lotById } from '../data'
import { checkContact, formatWhen, joinQueue, reservedAtOf, useApp, verifiedNeed } from '../store'
import { ReservePolicy, Ticket } from '../ticket'

export default function Queue() {
  const app = useApp()
  const [params] = useSearchParams()
  const [lotId, setLotId] = useState(lotById(params.get('lot') ?? '')?.id ?? LOTS[0].id)
  const [phone, setPhone] = useState('')
  const [arrive, setArrive] = useState(app.trip.arrive)
  const [vehicle, setVehicle] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const c = checkContact(phone, vehicle)
    setError('error' in c ? c.error : joinQueue(lotId, c.phone, c.vehicle, arrive, verifiedNeed(app.trip)))
  }

  const mine = app.queue.filter((q) => q.mine).reverse()
  const when = reservedAtOf(app.trip.date, arrive)

  return (
    <div className="container section narrow">
      <p className="eyebrow">MY PARKING PASS</p>
      <h1 className="page-title">내 예약</h1>
      <p className="muted">예약 시간과 순서를 확인하고, 늦을 때는 미룰 수 있어요.</p>

      {mine.length === 0 ? (
        <section className="panel empty">
          <b>아직 예약이 없어요</b>
          <p className="muted small">예약 내역은 이 기기의 브라우저에 저장됩니다.</p>
        </section>
      ) : (
        mine.map((q) => <Ticket key={q.lotId + q.no} q={q} />)
      )}

      <section className="panel">
        <h3>바로 예약하기</h3>
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
            <span>예약 시간 (도착 예정)</span>
            <input type="time" value={arrive} onChange={(e) => setArrive(e.target.value)} required />
          </label>
          {!Number.isNaN(when) && (
            <p className="small">
              예약 시간 <b>{formatWhen(when)}</b>
            </p>
          )}
          <label>
            <span>휴대전화 번호</span>
            <input type="tel" inputMode="numeric" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-1234-5678" maxLength={13} required />
          </label>
          <label>
            <span>차량번호</span>
            <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="12가 3456" maxLength={9} required />
          </label>
          <ReservePolicy />
          <p className="muted small">로그인 없이 전화번호와 차량번호만으로 예약해요. 입력한 번호는 이 기기의 브라우저에만 저장되고 서버로 보내지 않습니다. 시연용이라 실제 주차 공간을 확보해 주지는 않아요.</p>
          {error && <p className="error small">{error}</p>}
          <button className="btn btn-primary" type="submit">
            예약하기
          </button>
        </form>
      </section>
    </div>
  )
}
