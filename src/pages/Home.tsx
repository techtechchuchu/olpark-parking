import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SHOWS, VISITS, kstDate } from '../data'
import { LiveLine } from '../live'
import { bookingWindow, setTrip, useApp } from '../store'
import { DemoTag, Stepper, UNITY_FILES } from '../ui'

export const arriveFor = (showTime: string) => {
  const [h, m] = showTime.split(':').map(Number)
  return `${String(Math.max(0, h - 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 1단계: 목적지 선택 (공연, 또는 공연 없이 찾는 공원 시설) */
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
          어디로 가시나요?
        </h1>
        <p className="muted small rise" style={{ animationDelay: '100ms' }}>
          공연을 보러 가거나, 공연 없이 공원을 찾는 경우 모두 안내해요.
        </p>
        <div className="rise" style={{ animationDelay: '180ms' }}>
          <LiveLine />
        </div>
      </div>
      <h2 className="pick-title rise" style={{ animationDelay: '320ms' }}>
        공연 보러 가요 <DemoTag>가상 공연 3개</DemoTag>
      </h2>
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
              <span className="go">이 공연 가는 방법 보기 →</span>
            </div>
          </button>
        ))}
      </div>
      <h2 className="pick-title rise" style={{ animationDelay: '900ms' }}>
        공연 없이 방문해요
      </h2>
      <p className="muted small rise" style={{ animationDelay: '900ms' }}>
        산책·운동·전시처럼 공원 시설을 찾을 때 골라 주세요. 날짜와 시각은 다음 단계에서 정해요.
      </p>
      <div className="visit-grid rise" style={{ animationDelay: '980ms' }}>
        {VISITS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={'visit-card' + (trip.showId === v.id ? ' on' : '')}
            onClick={() => {
              // 방문은 정해진 시작 시각이 없으므로 내일 낮 2시~5시를 기본값으로 두고 다음 단계에서 고치게 한다
              setTrip({ ...trip, showId: v.id, date: kstDate(1), arrive: '14:00', leave: '17:00' })
              nav('/map')
            }}
          >
            <span className="visit-icon" aria-hidden>
              {v.poster.lines[0]}
            </span>
            <b>{v.venue}</b>
            <span className="muted small">{v.genre}</span>
          </button>
        ))}
      </div>
      <p className="main-more rise" style={{ animationDelay: '700ms' }}>
        <Link to="/map" className="link">
          목적지를 정하지 않고 지도부터 볼게요 →
        </Link>
      </p>
    </div>
  )
}
