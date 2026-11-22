import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { HOURS, MONTHLY, PARKLOG, SOURCES, analyze, DEFAULT_FILTERS } from '../history'
import raw from '../parking-data.json'
import { DemoTag, RealTag } from '../ui'

// "데이터" 탭: 이 서비스가 어떤 공공데이터를 어디에 쓰는지, 무엇이 실제이고 무엇이 예시인지 한 곳에서 보여준다.
// 숫자는 모두 src/parking-data.json 에서 계산한다 (손으로 적은 값 없음).

type Zone = { zone: string; counts: Record<string, number>; first: string; last: string }
const zones = (raw.congestion.zones as Zone[])
const congestionRecords = zones.reduce((s, z) => s + Object.values(z.counts).reduce((a, b) => a + b, 0), 0)
const congestionFrom = zones.map((z) => z.first).sort()[0]
const congestionTo = zones.map((z) => z.last).sort().at(-1)

/** 화면에 처음 보일 때 한 번만 true 가 된다 (애니메이션을 그때 시작) */
function useInView<T extends Element>() {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!('IntersectionObserver' in window)) return setSeen(true)
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setSeen(true)
        io.disconnect()
      }
    }, { threshold: 0.2 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [ref, seen] as const
}

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** 스크롤해서 보이면 아래에서 떠오르는 상자. delay: 순서대로 나타나게 하는 지연(ms) */
function Reveal({ as: Tag = 'section', className = '', delay = 0, children }: { as?: 'section' | 'article' | 'div'; className?: string; delay?: number; children: ReactNode }) {
  const [ref, seen] = useInView<HTMLElement>()
  return (
    <Tag ref={ref as never} className={`reveal ${className} ${seen ? 'in' : ''}`} style={{ '--d': `${delay}ms` } as React.CSSProperties}>
      {children}
    </Tag>
  )
}

/** 0에서 목표값까지 올라가는 숫자 */
function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const [ref, seen] = useInView<HTMLElement>()
  const [v, setV] = useState(0)
  useEffect(() => {
    if (!seen) return
    if (reduced()) return setV(to)
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 1200)
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [seen, to])
  return (
    <b ref={ref}>
      {v.toLocaleString()}
      {suffix}
    </b>
  )
}

/** 막대 그래프: 보이면 왼쪽부터 차례로 자란다 */
function Bars({ values, labels, hi, unit, wide }: { values: number[]; labels: string[]; hi: number; unit: string; wide?: boolean }) {
  const max = Math.max(...values)
  const [ref, seen] = useInView<HTMLDivElement>()
  return (
    <div ref={ref} className={'bars' + (wide ? ' bars-wide' : '') + (seen ? ' in' : '')} role="img" aria-label={`최대 ${Math.round(max).toLocaleString()}${unit}`}>
      {values.map((v, i) => (
        <div key={i} className={'bar' + (i === hi ? ' hi' : '')} title={`${labels[i]} ${Math.round(v).toLocaleString()}${unit}`}>
          <i style={{ height: seen ? `${Math.max(2, (v / max) * 100)}%` : '2%', transitionDelay: `${i * (wide ? 18 : 35)}ms` }} />
          <span>{labels[i]}</span>
        </div>
      ))}
    </div>
  )
}

const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0] // 월~일
const DOW_NAME = ['일', '월', '화', '수', '목', '금', '토']

/** 요일×시간 히트맵. 칸이 대각선 방향으로 차례로 나타난다 */
function Heat() {
  const [ref, seen] = useInView<HTMLDivElement>()
  const [pick, setPick] = useState<{ d: number; h: number } | null>(null)
  const P = raw.parklog as { entry: number[][]; daysByDow: number[] }
  const val = (d: number, h: number) => P.entry[d][h] / P.daysByDow[d]
  const max = Math.max(...DOW_ORDER.flatMap((d) => HOURS.map((h) => val(d, h))))
  const cur = pick ?? (() => {
    let best = { d: 1, h: 8, v: -1 }
    for (const d of DOW_ORDER) for (const h of HOURS) if (val(d, h) > best.v) best = { d, h, v: val(d, h) }
    return best
  })()
  return (
    <div ref={ref} className={'heat' + (seen ? ' in' : '')}>
      <div className="heat-grid" style={{ gridTemplateColumns: `16px repeat(${HOURS.length}, 1fr)` }}>
        <span />
        {HOURS.map((h) => (
          <span key={h} className="heat-h">
            {h % 3 === 1 ? h : ''}
          </span>
        ))}
        {DOW_ORDER.map((d, r) => (
          <div key={d} className="heat-row">
            <span className="heat-d">{DOW_NAME[d]}</span>
            {HOURS.map((h, c) => (
              <button
                key={h}
                type="button"
                aria-label={`${DOW_NAME[d]}요일 ${h}시 평균 ${Math.round(val(d, h))}대`}
                className={'heat-c' + (pick && pick.d === d && pick.h === h ? ' sel' : '')}
                style={{ '--a': (val(d, h) / max).toFixed(3), transitionDelay: `${(r + c) * 22}ms` } as React.CSSProperties}
                onClick={() => setPick({ d, h })}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="heat-read small">
        <b>
          {DOW_NAME[cur.d]}요일 {cur.h}시
        </b>{' '}
        평균 입차 <b>{Math.round(val(cur.d, cur.h)).toLocaleString()}대</b>
        {!pick && <span className="muted"> (가장 몰리는 칸)</span>}
      </p>
    </div>
  )
}

/** 주차구역별 원활·혼잡·만차 비율 (가로 누적 막대). 보이면 왼쪽에서 채워진다 */
function ZoneBars() {
  const [ref, seen] = useInView<HTMLDivElement>()
  const rows = zones
    .map((z) => {
      const t = Object.values(z.counts).reduce((a, b) => a + b, 0)
      const f = (k: string) => ((z.counts[k] ?? 0) / t) * 100
      return { zone: z.zone, full: f('만차'), busy: f('혼잡'), free: f('원활'), t }
    })
    .sort((a, b) => b.full - a.full)
  return (
    <div ref={ref} className={'zbars' + (seen ? ' in' : '')}>
      {rows.map((r, i) => (
        <div key={r.zone} className="zbar" style={{ transitionDelay: `${i * 60}ms` }}>
          <span className="zbar-n">{r.zone}</span>
          <span className="zbar-t" role="img" aria-label={`${r.zone} 만차 ${Math.round(r.full)}% 혼잡 ${Math.round(r.busy)}% 원활 ${Math.round(r.free)}%`}>
            <i className="z-full" style={{ width: `${r.full}%` }} />
            <i className="z-busy" style={{ width: `${r.busy}%` }} />
            <i className="z-free" style={{ width: `${r.free}%` }} />
          </span>
          <b className="zbar-v">{Math.round(r.full)}%</b>
        </div>
      ))}
      <p className="zbar-legend small">
        <i className="z-full" /> 만차 <i className="z-busy" /> 혼잡 <i className="z-free" /> 원활
      </p>
    </div>
  )
}

export default function DataPage() {
  const all = analyze({ ...DEFAULT_FILTERS, dow: 'all' }, '2026-11-23')
  const peakIdx = all.entry.indexOf(Math.max(...all.entry))
  const months = MONTHLY.map((m) => m.cars)
  const monthLabels = MONTHLY.map((m) => (m.month === 1 ? `${String(m.year).slice(2)}.1` : String(m.month)))
  const maxMonth = MONTHLY[months.indexOf(Math.max(...months))]

  return (
    <div className="container section">
      <p className="eyebrow">DATA</p>
      <h1 className="page-title">이 서비스가 쓰는 데이터</h1>
      <p className="muted">한국체육산업개발이 공공데이터포털에 개방한 올림픽공원 주차 데이터 4가지로 혼잡을 예측해요. 실제 기록과 지어낸 예시 값은 늘 구분해서 표시해요.</p>
      <p className="small">
        <RealTag>실제 데이터</RealTag> 공공데이터 그대로 · <DemoTag>예시</DemoTag> 시연을 위해 지어낸 값
      </p>

      <Reveal className="panel">
        <div className="panel-head">
          <h3>한눈에 보기</h3>
        </div>
        <div className="kpi-row">
          <div>
            <span className="muted small">입출차 기록</span>
            <CountUp to={PARKLOG.total} suffix="건" />
            <span className="muted small">{PARKLOG.from.slice(0, 7)} 한 달</span>
          </div>
          <div>
            <span className="muted small">혼잡도 기록</span>
            <CountUp to={congestionRecords} suffix="건" />
            <span className="muted small">주차구역 {zones.length}곳</span>
          </div>
          <div>
            <span className="muted small">월별 주차 대수</span>
            <CountUp to={MONTHLY.length} suffix="개월" />
            <span className="muted small">
              {MONTHLY[0].year}.{MONTHLY[0].month}~{MONTHLY.at(-1)!.year}.{MONTHLY.at(-1)!.month}
            </span>
          </div>
          <div>
            <span className="muted small">실시간 주차현황</span>
            <CountUp to={1} suffix="개 API" />
            <span className="muted small">공원 전체 한 값</span>
          </div>
        </div>
      </Reveal>

      <h2 className="data-h">실제 공공데이터 4가지</h2>
      <div className="data-list">
        <Reveal as="article" className="panel" delay={0}>
          <div className="panel-head">
            <h3>① 올림픽공원 입출차 정보</h3>
            <RealTag>파일 · {PARKLOG.from.slice(0, 7)}</RealTag>
          </div>
          <p className="small">{PARKLOG.total.toLocaleString()}건의 입·출차 시각으로 요일·시간대별 평균 입차, 주차 중인 차량 수, 평균 체류시간을 계산해요.</p>
          <p className="small">
            <b>쓰는 곳</b> 도착 시각의 혼잡 예측, "대중교통을 권할지 차로 와도 될지" 판정
          </p>
          <p className="muted small">한계: 동2문·남2문·북2문 합계라서 주차장별 구분은 없어요.</p>
        </Reveal>
        <Reveal as="article" className="panel" delay={90}>
          <div className="panel-head">
            <h3>② 주차장 혼잡도 정보</h3>
            <RealTag>파일 · {congestionFrom.slice(0, 7)}~{congestionTo?.slice(0, 7)}</RealTag>
          </div>
          <p className="small">구역({zones.map((z) => z.zone).join('·')})별 원활·혼잡·만차 기록 {congestionRecords.toLocaleString()}건으로, 구역마다 과거에 만차였던 비율과 시간대를 보여줘요.</p>
          <p className="small">
            <b>쓰는 곳</b> 주차장 카드의 "과거 기록에서 만차였던 비율"
          </p>
          <p className="muted small">한계: 기록이 남은 시점만 있어서, 모든 시간대를 빠짐없이 덮지는 않아요.</p>
        </Reveal>
        <Reveal as="article" className="panel" delay={180}>
          <div className="panel-head">
            <h3>③ 월별 주차현황</h3>
            <RealTag>파일 · {MONTHLY.length}개월</RealTag>
          </div>
          <p className="small">월별 주차 대수로 계절과 성수기를 봐요. 가장 붐빈 달은 {maxMonth.year}년 {maxMonth.month}월({maxMonth.cars.toLocaleString()}대)이에요.</p>
          <p className="small">
            <b>쓰는 곳</b> 주차장 상세의 월별 추이
          </p>
        </Reveal>
        <Reveal as="article" className="panel" delay={270}>
          <div className="panel-head">
            <h3>④ 올림픽공원 실시간 주차현황</h3>
            <RealTag>API · 실시간</RealTag>
          </div>
          <p className="small">지금 공원에 주차 중인 차량 수예요. 장기주차 누적 추정 1,060대를 빼고 보여줘요.</p>
          <p className="small">
            <b>쓰는 곳</b> 소개 화면과 가는 방법의 "지금 공원에 주차 중"
          </p>
          <p className="muted small">한계: 공원 전체 값 하나뿐이라 주차장별 실제 잔여면은 알 수 없어요.</p>
        </Reveal>
      </div>

      <Reveal className="panel">
        <div className="panel-head">
          <h3>시간대별 평균 입차 (대)</h3>
          <RealTag>2024년 7월 실제 기록</RealTag>
        </div>
        <Bars values={all.entry} labels={HOURS.map((h) => String(h))} hi={peakIdx} unit="대" />
        <p className="small">
          입차가 가장 몰리는 시간은 <b>{all.entryPeak}</b>이에요 ({PARKLOG.days}일 평균, 하루 약 {all.perDay.toLocaleString()}대). 오후에도 입차가 꾸준해서, 공연이 있는 저녁 시간대는 이 평균에 공연 관람객이 더해질 수 있어요.
        </p>
      </Reveal>

      <Reveal className="panel">
        <div className="panel-head">
          <h3>요일 × 시간 입차 지도</h3>
          <RealTag>2024년 7월 실제 기록</RealTag>
        </div>
        <Heat />
        <p className="muted small">진할수록 그 시간에 평균 입차가 많아요. 칸을 누르면 값이 보여요.</p>
      </Reveal>

      <Reveal className="panel">
        <div className="panel-head">
          <h3>주차구역별 혼잡 기록</h3>
          <RealTag>혼잡도 정보 {congestionRecords.toLocaleString()}건</RealTag>
        </div>
        <ZoneBars />
        <p className="muted small">구역마다 기록된 원활·혼잡·만차의 비율이에요. 만차 비율이 높은 구역은 붐빌 때 먼저 차요.</p>
      </Reveal>

      <Reveal className="panel">
        <div className="panel-head">
          <h3>월별 주차 대수 (올림픽공원)</h3>
          <RealTag>{SOURCES.monthly.replace('한국체육산업개발주식회사_', '')}</RealTag>
        </div>
        <Bars values={months} labels={monthLabels} hi={months.indexOf(Math.max(...months))} unit="대" wide />
      </Reveal>

      <h2 className="data-h">길찾기와 지도</h2>
      <Reveal className="panel">
        <ul className="data-ul small">
          <li>
            <b>지도 윤곽</b> OpenStreetMap 기여자 (ODbL). 3D 지도의 건물·길·연못 윤곽이에요.
          </li>
          <li>
            <b>대중교통 길찾기</b> 카카오맵 경로 조회. 출발지에서 공연장까지 몇 분 걸리고 어떤 호선·버스를 타는지 그때그때 가져오며, 서버에 저장하지 않아요.
          </li>
          <li>
            <b>내 위치</b> 길찾기 한 번에만 쓰고 저장하지 않아요.
          </li>
        </ul>
      </Reveal>

      <h2 className="data-h">시연용 예시 값</h2>
      <Reveal className="panel">
        <p className="small">
          <DemoTag /> 아래는 실제 데이터가 아니라 시연을 위해 지어낸 값이에요.
        </p>
        <ul className="data-ul small">
          <li>공연 일정과 포스터</li>
          <li>주차장별 잔여 주차면과 대기 순서</li>
          <li>주차면 배치, 장애인·임산부 전용면 수</li>
          <li>예약·대기 내역 (이 기기의 브라우저에만 저장돼요)</li>
        </ul>
      </Reveal>

      <h2 className="data-h">예측은 이렇게 해요</h2>
      <Reveal className="panel">
        <ol className="data-ul small">
          <li>
            방문 예정 요일·시간과 같은 시간대의 <b>과거 평균 주차 대수</b>를 구해요.
          </li>
          <li>
            <b>관측 최대치</b>와 견줘서 원활·보통·혼잡으로 나눠요.
          </li>
          <li>혼잡이면 대중교통을, 여유 있으면 차를 권하고, 더 한산한 시간이 있으면 알려드려요.</li>
        </ol>
        <p className="muted small">과거 기록 기반의 단순 통계이고 입차를 보장하지 않아요. 걷는 시간은 직선거리 × 1.3 ÷ 분당 75m의 추정값이에요.</p>
      </Reveal>

      <p className="main-more">
        <Link to="/map" className="btn btn-primary">
          가는 방법 보러 가기 →
        </Link>
      </p>
    </div>
  )
}
