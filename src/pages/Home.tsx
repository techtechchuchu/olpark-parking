import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SHOWS } from '../data'
import { LiveLine } from '../live'
import { setTrip, useApp } from '../store'
import { DemoTag, Stepper, UNITY_FILES } from '../ui'

export const arriveFor = (showTime: string) => {
  const [h, m] = showTime.split(':').map(Number)
  return `${String(Math.max(0, h - 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 1단계: 인사말과 공연 선택 */
export default function Home() {
  const { trip } = useApp()
  const nav = useNavigate()

  // 공연을 고르는 동안 3D 지도 파일(약 18MB)을 미리 받아 둔다. 실제 휴대폰(좁은 창)에서는 데이터 요금 때문에 받지 않는다.
  useEffect(() => {
    if (window.innerWidth < 700) return
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
        <p className="hello rise" style={{ animationDelay: '0ms' }}>
          안녕하세요, 올팍입니다.
        </p>
        <h1 className="page-title rise" style={{ animationDelay: '120ms' }}>
          공연 가는 길,
          <br />
          주차는 저희가 도와드릴게요.
        </h1>
        <div className="rise" style={{ animationDelay: '240ms' }}>
          <LiveLine />
        </div>
      </div>

      <div className="section-head rise" style={{ animationDelay: '360ms' }}>
        <h2>어떤 공연에 가시나요?</h2>
        <span className="muted small">
          가상 공연 3개 <DemoTag />
        </span>
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
              <span className="go">이 공연으로 주차장 보기 →</span>
            </div>
          </button>
        ))}
      </div>
      <p className="main-more rise" style={{ animationDelay: '900ms' }}>
        <Link to="/map" className="link">
          공연을 고르지 않고 지도부터 볼게요 →
        </Link>
      </p>
    </div>
  )
}
