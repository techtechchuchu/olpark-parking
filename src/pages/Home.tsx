import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SHOWS } from '../data'
import { LiveLine } from '../live'
import { bookingWindow, setTrip, useApp } from '../store'
import { DemoTag, Stepper, UNITY_FILES } from '../ui'

export const arriveFor = (showTime: string) => {
  const [h, m] = showTime.split(':').map(Number)
  return `${String(Math.max(0, h - 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 1단계: 공연 선택 */
export default function Home() {
  const { trip } = useApp()
  const nav = useNavigate()

  // 공연을 고르는 동안 3D 지도 파일(약 18MB)을 자동으로 미리 받기 시작한다 (지원하는 브라우저에서만 동작).
  useEffect(() => {
    const links = UNITY_FILES.map((href) => {
      const l = document.createElement('link')
      l.rel = 'prefetch'
      l.href = href
      document.head.appendChild(l)
      return l
    })
    return () => links.forEach((l) => l.remove())
  }, [])

  return (
    <div className="container section">
      <Stepper step={1} />
      <div className="greeting">
        <h1 className="page-title step-title rise" style={{ animationDelay: '0ms' }}>
          어떤 공연에 가시나요?
        </h1>
        <p className="muted small rise" style={{ animationDelay: '100ms' }}>
          가상 공연 3개 <DemoTag />
        </p>
        <div className="rise" style={{ animationDelay: '180ms' }}>
          <LiveLine />
        </div>
      </div>
      <div className="show-grid">
        {SHOWS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={'show-card rise' + (trip.showId === s.id ? ' on' : '')}
            style={{ animationDelay: `${480 + i * 140}ms` }}
            onClick={() => {
              setTrip({ ...trip, showId: s.id, date: s.date, arrive: arriveFor(s.time) })
              nav('/map')
            }}
          >
            <div className="poster" style={{ backgroundImage: s.poster.bg, color: s.poster.fg }}>
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
              <span className={'tag ' + (bookingWindow(s.date).open ? 'tag-real' : '')}>{bookingWindow(s.date).open ? '지금 예약 가능' : `예약은 ${bookingWindow(s.date).from}부터`}</span>
              <span className="go">이 공연으로 주차장 보기 →</span>
            </div>
          </button>
        ))}
      </div>
      <p className="main-more rise" style={{ animationDelay: '700ms' }}>
        <Link to="/map" className="link">
          공연을 고르지 않고 지도부터 볼게요 →
        </Link>
      </p>
    </div>
  )
}
