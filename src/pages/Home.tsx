import { SHOWS } from '../data'
import { setTrip, useApp } from '../store'
import { DemoTag } from '../ui'

const arriveFor = (showTime: string) => {
  const [h, m] = showTime.split(':').map(Number)
  return `${String(Math.max(0, h - 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 공연·날짜·도착시간 선택. 바꾸는 즉시 지도와 예측에 반영된다 */
export function TripForm() {
  const { trip } = useApp()
  return (
    <form className="trip-form" onSubmit={(e) => e.preventDefault()}>
      <label>
        <span>공연 선택</span>
        <select
          value={trip.showId}
          onChange={(e) => {
            const s = SHOWS.find((x) => x.id === e.target.value)!
            setTrip({ ...trip, showId: s.id, date: s.date, arrive: arriveFor(s.time) })
          }}
        >
          {SHOWS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title} · {s.venue}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>관람 날짜</span>
        <input type="date" value={trip.date} onChange={(e) => e.target.value && setTrip({ ...trip, date: e.target.value })} required />
      </label>
      <label>
        <span>도착 예정시간</span>
        <input type="time" value={trip.arrive} onChange={(e) => e.target.value && setTrip({ ...trip, arrive: e.target.value })} required />
      </label>
      <label>
        <span>출발 지역 / 가까운 역</span>
        <input type="text" placeholder="예: 잠실역" value={trip.origin} onChange={(e) => setTrip({ ...trip, origin: e.target.value })} />
      </label>
    </form>
  )
}

export function UpcomingShows() {
  const { trip } = useApp()
  return (
    <section className="upcoming">
      <p className="eyebrow">UPCOMING SHOWS</p>
      <div className="section-head">
        <h2>다가오는 공연</h2>
        <span className="muted small">
          가상 공연 3개 <DemoTag />
        </span>
      </div>
      <div className="show-grid">
        {SHOWS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={'show-card' + (trip.showId === s.id ? ' on' : '')}
            aria-pressed={trip.showId === s.id}
            onClick={() => {
              setTrip({ ...trip, showId: s.id, date: s.date, arrive: arriveFor(s.time) })
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          >
            <div className="poster" style={{ background: s.poster.bg, color: s.poster.fg }}>
              <small>{s.genre}</small>
              <strong>
                {s.poster.lines.map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </strong>
              <em>{s.poster.sub}</em>
              <span className="tag poster-tag">예시 공연</span>
            </div>
            <div className="show-meta">
              <b>{s.title}</b>
              <span>
                {s.date.replaceAll('-', '.')} · {s.time}
              </span>
              <span>📍 {s.venue}</span>
            </div>
          </button>
        ))}
      </div>
      <p className="muted small">공연을 누르면 그 공연장 기준으로 지도와 혼잡 예측이 바뀝니다.</p>
    </section>
  )
}
