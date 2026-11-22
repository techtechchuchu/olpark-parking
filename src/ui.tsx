import type { ReactNode } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
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

// 3D 지도 파일 버전. Unity 빌드를 새로 넣을 때마다 올려야 브라우저가 이전 파일을 다시 쓰지 않는다.
export const UNITY_V = '12'
export const UNITY_PAGE = `/unity/index.html?v=${UNITY_V}`
export const UNITY_FILES = ['data', 'framework.js', 'wasm'].map((ext) => `/unity/Build/WebGL.${ext}?v=${UNITY_V}`)

const STEPS = ['공연', '가는 방법', '주차장', '예약']
const STEP_LINK = ['/start', '/map', '/map?view=map']
/** 진행 표시: ① 공연 → ② 가는 방법(대중교통·자동차) → ③ 주차장 → ④ 예약. 지난 단계는 눌러서 돌아갈 수 있다 */
export function Stepper({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="stepper" aria-label={`4단계 중 ${step}단계: ${STEPS[step - 1]}`}>
      {STEPS.map((label, i) => {
        const n = i + 1
        const cls = n === step ? 'now' : n < step ? 'done' : ''
        return (
          <li key={label} className={cls} aria-current={n === step ? 'step' : undefined}>
            <i>{n < step ? '✓' : n}</i>
            {n < step ? <Link to={STEP_LINK[i]}>{label}</Link> : <span>{label}</span>}
          </li>
        )
      })}
    </ol>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    // PC에서도 휴대폰 폭의 화면으로 보여준다
    <div className="app-shell">
      <div className="demo-bar">
        시연용 서비스 · 실제 주차 예약 불가 <span className="tag tag-outline">DEMO</span>
      </div>
      <header className="header">
        <div className="container header-in">
          <Link to="/" className="brand">
            <Logo />
            <span>
              올팍<b>패스</b>
            </span>
          </Link>
          {/* 데이터 탭은 맨 윗줄 오른쪽에 따로 둔다 (서비스 이용 흐름과는 별개의 정보 화면) */}
          <NavLink to="/data" className="data-pill">
            <span aria-hidden>📊</span> 데이터
          </NavLink>
          <nav className="nav">
            <NavLink to="/" end>
              소개
            </NavLink>
            <NavLink to="/start">공연</NavLink>
            {/* 지도·비교는 "가는 방법" 한 곳으로 합쳤다. 주차장 8곳 비교(/parking)는 그 안의 "전체 비교하기"로 들어간다 */}
            <NavLink to="/map" className={() => (/^\/(map|parking)/.test(pathname) ? 'active' : '')}>
              가는 방법
            </NavLink>
            <NavLink to="/queue">내 예약</NavLink>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="footer">
        <div className="container">
          <div className="brand brand-sm">
            <Logo />
            <span>올팍패스</span>
          </div>
          <p>공연의 설렘은 그대로, 주차 걱정은 조금 덜어보세요.</p>
          <p>
            예시 데이터 기반 시연 · 실제 제휴 주차장 없음 ·{' '}
            <Link to="/admin" className="link">
              운영자 화면
            </Link>
          </p>
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
    </div>
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
