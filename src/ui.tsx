import type { ReactNode } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { DOW_LABEL, HOURS, PARKLOG, filterSummary } from './history'
import type { DowFilter, Filters } from './history'

export const DemoTag = ({ children = '예시 데이터' }: { children?: ReactNode }) => <span className="tag">{children}</span>

export function Logo() {
  return (
    <span className="logo-mark" aria-hidden>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.5 17V7h3.2a3 3 0 0 1 0 6H9.5" />
      </svg>
    </span>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="demo-bar">
        시연용 서비스 · 실제 주차 예약 불가 <span className="tag tag-outline">DEMO</span>
      </div>
      <header className="header">
        <div className="container header-in">
          <Link to="/" className="brand">
            <Logo />
            <span>
              올팍 <b>파킹패스</b>
            </span>
          </Link>
          <nav className="nav">
            <NavLink to="/" end>
              3D 지도
            </NavLink>
            <NavLink to="/parking">주차장 비교</NavLink>
            <NavLink to="/queue">내 대기</NavLink>
          </nav>
          <Link to="/admin" className="btn btn-outline btn-sm admin-link">
            관리자 시연 ↗
          </Link>
        </div>
      </header>
      <main>{children}</main>
      <footer className="footer">
        <div className="container">
          <div className="brand brand-sm">
            <Logo />
            <span>올팍 파킹패스</span>
          </div>
          <p>공연의 설렘은 그대로, 주차 걱정은 조금 덜어보세요.</p>
          <p>예시 데이터 기반 시연 · 실제 제휴 주차장 없음</p>
          <hr />
          <p>출발 전 상태를 확인하세요. 이동 중 조작하거나 도로에서 정차·배회하며 대기하지 마세요.</p>
          <div className="contest">
            <b>한국체육산업개발(주) 2026 공공데이터 활용 경진대회 출품작</b>
            <p>제작: 울산대학교 ICT융합학부 팀 김손추 (김기백 · 손현 · 추재현)</p>
            <p>기관이 운영하는 공식 서비스가 아니라, 개방 공공데이터를 활용해 만든 공모전 출품용 시연 서비스입니다.</p>
            <p>
              활용 공공데이터(한국체육산업개발 개방): 올림픽공원 실시간 주차현황 · 올림픽공원 입출차 정보 · 주차장 혼잡도 정보 · 월별주차현황 / 지도 윤곽: ©{' '}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                OpenStreetMap
              </a>{' '}
              기여자
            </p>
          </div>
        </div>
      </footer>
    </>
  )
}

export function RealTag({ children = '실제 데이터' }: { children?: ReactNode }) {
  return <span className="tag tag-real">{children}</span>
}

export function FilterPanel({ value, onChange, tripDate }: { value: Filters; onChange: (f: Filters) => void; tripDate: string }) {
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch })
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>분석 조건</h3>
        <RealTag>2024년 7월 실제 입출차 {PARKLOG.total.toLocaleString()}건</RealTag>
      </div>
      <div className="chips">
        {(Object.keys(DOW_LABEL) as DowFilter[]).map((d) => (
          <button key={d} type="button" className={'chip' + (value.dow === d ? ' on' : '')} onClick={() => set({ dow: d })}>
            {DOW_LABEL[d]}
          </button>
        ))}
      </div>
      <div className="filter-row two">
        <label>
          <span>살펴볼 시간대</span>
          <select value={value.hour} onChange={(e) => set({ hour: Number(e.target.value) })}>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {h}:00–{h + 1}:00
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">{filterSummary(value, tripDate)} · 공원 전체 합계이며 주차구역별 구분은 원본에 없습니다.</p>
      </div>
    </section>
  )
}

export function HourChart({ entry, exit }: { entry: number[]; exit: number[] }) {
  const max = Math.max(15, Math.ceil(Math.max(...entry, ...exit) / 15) * 15)
  const W = 720
  const H = 240
  const padL = 34
  const padB = 26
  const innerH = H - padB - 10
  const step = (W - padL) / HOURS.length
  const y = (v: number) => 10 + innerH - (v / max) * innerH
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t))
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="시간대별 평균 입차·출차 막대 그래프">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="grid" />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="axis">
              {t}
            </text>
          </g>
        ))}
        {HOURS.map((h, i) => {
          const x = padL + i * step
          const bw = step * 0.32
          return (
            <g key={h}>
              <rect x={x + step * 0.14} y={y(entry[i])} width={bw} height={y(0) - y(entry[i])} rx="2" className="bar-in">
                <title>{`${h}시 평균 입차 ${entry[i]}대`}</title>
              </rect>
              <rect x={x + step * 0.14 + bw + 2} y={y(exit[i])} width={bw} height={y(0) - y(exit[i])} rx="2" className="bar-out">
                <title>{`${h}시 평균 출차 ${exit[i]}대`}</title>
              </rect>
              <text x={x + step / 2} y={H - 8} textAnchor="middle" className="axis">
                {h}시
              </text>
            </g>
          )
        })}
      </svg>
      <div className="legend">
        <span>
          <i className="dot in" /> 평균 입차
        </span>
        <span>
          <i className="dot out" /> 평균 출차
        </span>
      </div>
    </div>
  )
}
