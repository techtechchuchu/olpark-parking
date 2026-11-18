import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SHOWS } from '../data'
import { setTrip, useApp } from '../store'
import { DemoTag } from '../ui'

function HeroArt() {
  // 시연용 일러스트 (실제 위치 안내 아님). 이후 Unity 3D 화면으로 교체 예정.
  return (
    <svg className="hero-art" viewBox="0 0 800 300" preserveAspectRatio="xMaxYMax slice" aria-hidden>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bfe0f5" />
          <stop offset="1" stopColor="#eef7f1" />
        </linearGradient>
        <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9dc8f" />
          <stop offset="1" stopColor="#8cc46a" />
        </linearGradient>
      </defs>
      <rect width="800" height="300" fill="url(#sky)" />
      <path d="M380 190 Q470 120 560 170 T800 150 V300 H380Z" fill="#9cc7a8" opacity=".6" />
      <rect x="668" y="92" width="3" height="60" fill="#7c8a94" />
      <circle cx="669.500" cy="110" r="6" fill="#7c8a94" />
      <ellipse cx="620" cy="196" rx="120" ry="34" fill="#f4f6f7" />
      <path d="M500 196 Q620 120 740 196Z" fill="#e3e9ec" />
      <rect x="512" y="196" width="216" height="20" fill="#c9d3d8" />
      <rect x="560" y="200" width="120" height="14" fill="#3e4a55" />
      <path d="M0 225 Q300 195 800 222 V300 H0Z" fill="url(#grass)" />
      <path d="M430 300 Q520 240 800 236 V246 Q540 252 470 300Z" fill="#efe9d8" />
      {[60, 470, 505, 760].map((x, i) => (
        <g key={x}>
          <rect x={x - 2} y={205} width="4" height="26" fill="#7a5a3a" />
          <circle cx={x} cy={196} r={i % 2 ? 16 : 20} fill={i % 2 ? '#e0a44a' : '#5fa35a'} />
        </g>
      ))}
    </svg>
  )
}

export default function Home() {
  const { trip } = useApp()
  const nav = useNavigate()
  const [form, setForm] = useState(trip)

  const pickShow = (id: string) => {
    const s = SHOWS.find((x) => x.id === id)!
    const [h, m] = s.time.split(':').map(Number)
    const arrive = `${String(h - 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    return { ...form, showId: id, date: s.date, arrive }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTrip({ ...form, origin: form.origin.trim() || '잠실역' })
    nav('/parking')
  }

  return (
    <>
      <section className="hero">
        <HeroArt />
        <div className="container hero-in">
          <p className="eyebrow-soft">올림픽공원 공연 관람객을 위한 주차 가이드</p>
          <h1>
            공연 가는 길,
            <br />
            주차부터 미리 확인하세요<span className="accent">.</span>
          </h1>
          <p className="lead">
            예상 대기시간을 비교하고, 온라인으로 대기하세요.
            <br />
            좋아하는 공연에 조금 더 여유롭게 도착할 수 있도록.
          </p>
          <p className="hero-points">● 주차 예측 · 온라인 대기 · 이동수단 비교</p>
          <span className="tag hero-tag">시연용 이미지 · 실제 위치 안내 아님</span>
        </div>
      </section>

      <section className="container section">
        <div className="section-head">
          <h2>어떤 공연에 가시나요?</h2>
          <DemoTag />
        </div>
        <form className="trip-form" onSubmit={submit}>
          <label>
            <span>관람 날짜</span>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </label>
          <label>
            <span>공연 선택</span>
            <select value={form.showId} onChange={(e) => setForm(pickShow(e.target.value))}>
              {SHOWS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>도착 예정시간</span>
            <input type="time" value={form.arrive} onChange={(e) => setForm({ ...form, arrive: e.target.value })} required />
          </label>
          <label>
            <span>출발 지역 / 가까운 역</span>
            <input type="text" placeholder="예: 잠실역" value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} />
          </label>
          <button className="btn btn-primary" type="submit">
            주차장 비교하기 →
          </button>
        </form>
        <div className="form-notes">
          <span>● 현재 현황과 과거 패턴을 함께 참고해요</span>
          <span>예상 시간은 범위로 안내하며, 입차를 보장하지 않아요.</span>
        </div>
      </section>

      <section className="container section">
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
              className="show-card"
              onClick={() => {
                const next = pickShow(s.id)
                setTrip({ ...next, origin: next.origin.trim() || '잠실역' })
                nav('/parking')
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
      </section>

      <section className="band">
        <div className="container">
          <div className="section-head">
            <h2>주차 걱정을 줄이는 세 가지 방법</h2>
            <span className="muted small">출발 전에 미리 확인하세요</span>
          </div>
          <div className="feature-grid">
            <div>
              <b>과거 패턴으로 미리 확인</b>
              <p>원하는 기간과 조건의 주차 기록을 참고하세요.</p>
            </div>
            <div>
              <b>차 안이 아닌, 온라인 대기</b>
              <p>대기번호를 받고 출발 전 상태를 확인하세요.</p>
            </div>
            <div>
              <b>내게 맞는 이동수단 비교</b>
              <p>주차 대기까지 고려한 예상 시간을 비교하세요.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="container notice-row">
        <p>
          이 서비스는 주차장을 찾아 배회하는 차량을 줄이기 위한 <b>시연 버전</b>입니다. 실제 주차장 연결과 예약은 지원하지 않습니다.
        </p>
        <Link to="/parking" className="link">
          주차장 살펴보기 →
        </Link>
      </section>
    </>
  )
}
