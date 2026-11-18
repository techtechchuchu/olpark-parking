import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { lotById, showById } from '../data'
import { DEFAULT_FILTERS, MONTHLY, PARKLOG, SOURCES, analyze, zoneStats } from '../history'
import type { Filters } from '../history'
import { activeQueue, remaining, useApp, waitRange } from '../store'
import { DemoTag, FilterPanel, HourChart, RealTag } from '../ui'
import { TransitCompare } from './Parking'

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export default function ParkingDetail() {
  const { id = '' } = useParams()
  const app = useApp()
  const lot = lotById(id)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)

  if (!lot) {
    return (
      <div className="container section">
        <h1 className="page-title">주차장을 찾을 수 없어요</h1>
        <Link to="/parking" className="link">
          ← 주차장 비교로 돌아가기
        </Link>
      </div>
    )
  }

  const st = app.lots[lot.id]
  const show = showById(app.trip.showId)
  const wait = waitRange(st, activeQueue(app, lot.id).length)
  const a = analyze(filters, app.trip.date)
  const wd = analyze({ ...filters, dow: 'weekday' }, app.trip.date)
  const we = analyze({ ...filters, dow: 'weekend' }, app.trip.date)
  const zone = zoneStats(lot.zone)
  const slack = toMin(show.time) - (toMin(app.trip.arrive) + wait[1] + lot.walkMin)
  const years = [...new Set(MONTHLY.map((m) => m.year))].sort()
  const yearTotal = (y: number) => MONTHLY.filter((m) => m.year === y).reduce((s, m) => s + m.cars, 0)
  const peakMonth = (y: number) => MONTHLY.filter((m) => m.year === y).sort((x, z) => z.cars - x.cars)[0]

  const rows: [string, string, string][] = [
    ['분석 날짜', `${wd.days}일`, `${we.days}일`],
    ['하루 평균 입차', `${wd.perDay.toLocaleString()}대`, `${we.perDay.toLocaleString()}대`],
    [`${filters.hour}시대 평균 입차`, `${wd.entryAtHour}대`, `${we.entryAtHour}대`],
    [`${filters.hour}시 주차 중이던 차량`, `${wd.presentAtHour}대`, `${we.presentAtHour}대`],
    ['주차 중 차량이 가장 많던 시간', wd.presentPeak, we.presentPeak],
    ['평균 체류시간', `${wd.stayAvg}분`, `${we.stayAvg}분`],
  ]

  return (
    <div className="container section">
      <Link to="/parking" className="link back">
        ← 주차장 비교
      </Link>
      <p className="eyebrow">PARKING INSIGHTS</p>
      <div className="section-head">
        <h1 className="page-title">{lot.name}</h1>
        <DemoTag>요금·면수는 예시</DemoTag>
      </div>
      <p className="muted">
        {lot.hours} · {lot.fee} · 공연장 도보 {lot.walkMin}분
      </p>

      <div className="stat-row">
        <div className="stat-card">
          <span className="muted small">현재 현황 · 예시</span>
          <b className="big">일반 잔여 {remaining(st)}면</b>
          <span className="small">
            임시 배정 {st.temp}면 · 점유 {st.occupied}면
          </span>
          <span className="small muted">기준 {new Date(app.updatedAt).toLocaleString('ko-KR')}</span>
        </div>
        <div className="stat-card">
          <span className="muted small">예상 입차 대기 · 단순 계산</span>
          <b className="big accent">
            {wait[0]}–{wait[1]}분
          </b>
          <span className="small">
            {app.trip.arrive} 도착 예정 · 도보 {lot.walkMin}분
          </span>
          <span className="small muted">{slack >= 0 ? `공연 시작까지 최소 약 ${slack}분 여유 예상` : `공연 시작에 약 ${-slack}분 늦을 수 있어요`}</span>
        </div>
        <div className="stat-card">
          <span className="muted small">
            {lot.zone} 구역 혼잡도 기록 <RealTag />
          </span>
          {zone ? (
            <>
              <b className="big">만차 {zone.fullRatio}%</b>
              <span className="small">
                기록 {zone.total}건 중 원활 {zone.free} · 혼잡 {zone.busy} · 만차 {zone.full}
              </span>
              <span className="small muted">
                {zone.first} ~ {zone.last}
                {zone.fullHours.length > 0 && ` · 만차 잦은 시각 ${zone.fullHours.join(', ')}`}
              </span>
            </>
          ) : (
            <b className="big">기록 없음</b>
          )}
        </div>
      </div>

      <FilterPanel value={filters} onChange={setFilters} tripDate={app.trip.date} />

      <section className="panel">
        <div className="panel-head">
          <h3>시간대별 평균 입차·출차 · {a.label}</h3>
          <RealTag />
        </div>
        <p className="muted small">
          {PARKLOG.from} ~ {PARKLOG.to} 실제 기록 · 하루·시간대당 평균 차량 대수 · 공원 전체 합계이며 예측 그래프가 아닙니다
        </p>
        <HourChart entry={a.entry} exit={a.exit} />
        <div className="kpi-row">
          <div>
            <span className="muted small">하루 평균 입차</span>
            <b>{a.perDay.toLocaleString()}대</b>
          </div>
          <div>
            <span className="muted small">평균 / 중앙 체류시간</span>
            <b>
              {a.stayAvg}분 / {a.stayMedian}분
            </b>
          </div>
          <div>
            <span className="muted small">입차 집중 시간대</span>
            <b>{a.entryPeak}</b>
          </div>
          <div>
            <span className="muted small">동시 주차 최대(평균)</span>
            <b>
              {a.presentMax.toLocaleString()}대 · {a.presentPeak.split(':')[0]}시
            </b>
          </div>
        </div>
        <p className="muted small">
          분석 날짜 {a.days}일 · 입차 {a.records.toLocaleString()}건. 체류시간은 입차부터 출차까지이며, 요일을 묶은 중앙값은 요일별 중앙값의 가중 평균입니다.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>평일과 주말 비교</h3>
          <RealTag />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>비교 항목 · 공원 전체</th>
                <th>평일(월~금)</th>
                <th>주말(토·일)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r[0]}>
                  <td>{r[0]}</td>
                  <td>{r[1]}</td>
                  <td>{r[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>사용한 데이터</h3>
          <RealTag />
        </div>
        <ul className="info-list small">
          <li>
            {SOURCES.parklog}: {PARKLOG.total.toLocaleString()}건 ({PARKLOG.from} ~ {PARKLOG.to})
          </li>
          <li>{SOURCES.congestion}</li>
          <li>
            {SOURCES.monthly}:{' '}
            {years.map((y) => `${y}년 ${yearTotal(y).toLocaleString()}대(최다 ${peakMonth(y).month}월)`).join(' · ')}
          </li>
        </ul>
        <p className="muted small">
          입출차 기록에는 주차구역 구분이 없어 시간대 패턴은 공원 전체 기준입니다. {lot.zone} 구역 위치는 지도의 같은 번호 주차장으로 연결한 것이며, 주차장별 잔여면·요금·대기 순서는 시연용 예시입니다. AI
          분석 결과가 아닙니다.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>출발 전, 이동수단도 비교해보세요</h3>
          <DemoTag />
        </div>
        <TransitCompare origin={app.trip.origin} wait={wait} walk={lot.walkMin} />
      </section>

      <Link to={`/queue?lot=${lot.id}`} className="btn btn-primary">
        온라인 대기 신청 →
      </Link>
    </div>
  )
}
