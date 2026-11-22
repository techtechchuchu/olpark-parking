import { useState } from 'react'
import { Link } from 'react-router-dom'
import { lotsFor, showById, stationsFor } from '../data'
import { ForecastPanel } from '../forecast'
import { DEFAULT_FILTERS, analyze, zoneStats } from '../history'
import type { Filters } from '../history'
import { LiveParkingBar } from '../live'
import { StationList } from '../transit'
import { LEVEL_LABEL, activeQueue, level, remaining, useApp, waitRange } from '../store'
import { DemoTag, FilterPanel, Logo, RealTag } from '../ui'

/** 공연장에 도착한 뒤 걸리는 시간 비교: 주차(입차 대기 + 도보) vs 지하철역에서 걷기 */
export function TransitCompare({ venue, wait, walk }: { venue: string; wait: [number, number]; walk: number }) {
  const station = stationsFor(venue)[0]
  return (
    <div className="transit">
      <div className="transit-cards">
        <div className="stat-card">
          <span className="muted small">차로 오면 · 주차 후</span>
          <b className="big">
            {wait[0] + walk}–{wait[1] + walk}분
          </b>
          <span className="small">
            주차 대기 {wait[0]}–{wait[1]}분(예시) + 도보 {walk}분
          </span>
        </div>
        <div className="stat-card">
          <span className="muted small">
            지하철로 오면 · {station.name}({station.lines})
          </span>
          <b className="big accent">{station.walkMin}분</b>
          <span className="small">역에서 걸어서 · 주차 대기 없음</span>
        </div>
      </div>
      <StationList venue={venue} />
      <p className="muted small">공연장 근처에 도착한 뒤부터의 시간입니다. 역 위치는 실제 지도 좌표이고, 걷는 시간은 직선거리로 계산한 추정값이에요.</p>
    </div>
  )
}

export default function Parking() {
  const app = useApp()
  const show = showById(app.trip.showId)
  const [sort, setSort] = useState<'walk' | 'wait'>('walk')
  const [mapOpen, setMapOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, dow: 'same' })
  const [transitOpen, setTransitOpen] = useState(false)
  const [openInfo, setOpenInfo] = useState<string | null>(null)

  const rows = lotsFor(show.venue).map((lot) => {
    const st = app.lots[lot.id]
    const ahead = activeQueue(app, lot.id).length
    return { lot, st, ahead, wait: waitRange(st, ahead), lv: level(st), zone: zoneStats(lot.zone) }
  }).sort((a, b) => (sort === 'walk' ? a.lot.walkMin - b.lot.walkMin : a.wait[0] - b.wait[0] || a.lot.walkMin - b.lot.walkMin))

  const best = [...rows].sort((a, b) => a.wait[0] - b.wait[0] || a.lot.walkMin - b.lot.walkMin)[0]
  const arriveHour = Math.min(23, Math.max(7, Number(app.trip.arrive.slice(0, 2)) || 17))
  const past = analyze({ ...filters, hour: arriveHour }, app.trip.date)

  return (
    <div className="container section">
      <p className="eyebrow">PARKING COMPARISON</p>
      <div className="section-head">
        <h1 className="page-title">어디에 주차할까요?</h1>
        <DemoTag>주차장별 잔여·대기는 예시</DemoTag>
      </div>
      <p className="muted">
        {show.title} · {app.trip.date} · 도착 예정 {app.trip.arrive}
      </p>

      <LiveParkingBar />
      <ForecastPanel />

      <section className="panel">
        <div className="panel-head">
          <h3>
            {past.label} {arriveHour}시대, 과거에는 이랬어요
          </h3>
          <RealTag>2024년 7월 실제 기록</RealTag>
        </div>
        <div className="kpi-row">
          <div>
            <span className="muted small">{arriveHour}시대 평균 입차</span>
            <b>{past.entryAtHour.toLocaleString()}대</b>
          </div>
          <div>
            <span className="muted small">{arriveHour}시 주차 중이던 차량</span>
            <b>{past.presentAtHour.toLocaleString()}대</b>
          </div>
          <div>
            <span className="muted small">입차가 가장 몰린 시간</span>
            <b>{past.entryPeak}</b>
          </div>
          <div>
            <span className="muted small">평균 체류시간</span>
            <b>{past.stayAvg}분</b>
          </div>
        </div>
        <p className="muted small">공원 전체(동2문·남2문·북2문 합계) 기준 · 분석 날짜 {past.days}일</p>
      </section>

      <div className="toolbar">
        <span className="small">
          <b>● 주차장별 현황(예시)</b> <span className="muted">기준 {new Date(app.updatedAt).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}</span>
        </span>
        <div className="toolbar-right">
          <button type="button" className={'btn btn-outline btn-sm' + (mapOpen ? ' on' : '')} onClick={() => setMapOpen(!mapOpen)}>
            📍 지도로 보기
          </button>
          <button type="button" className={'btn btn-outline btn-sm' + (filterOpen ? ' on' : '')} onClick={() => setFilterOpen(!filterOpen)}>
            {past.label} · 분석 조건
          </button>
        </div>
      </div>

      {mapOpen && (
        <section className="panel">
          <div className="panel-head">
            <h3>📍 위치 지도</h3>
            <DemoTag />
          </div>
          <div className="mini-map">
            <div className="venue-pin" style={{ left: '68%', top: '42%' }}>
              ♪ {show.venue}
            </div>
            {rows.map(({ lot, st, lv }) => (
              <Link key={lot.id} to={`/parking/${lot.id}`} className={`map-pin lv-${lv}`} style={{ left: `${lot.map.x}%`, top: `${lot.map.y}%` }}>
                <b>P</b> {lot.zone} · {remaining(st)}면
              </Link>
            ))}
          </div>
          <p className="muted small">
            간략 배치도입니다. 정확한 위치와 모양은{' '}
            <Link to="/map" className="link">
              3D 공원
            </Link>
            에서 확인하세요.
          </p>
        </section>
      )}
      {filterOpen && <FilterPanel value={filters} onChange={setFilters} tripDate={app.trip.date} />}

      <div className="section-head list-head">
        <h2>
          공원 내 주차장 <span className="accent">{rows.length}</span> 곳
        </h2>
        <label className="inline-select">
          <span className="muted small">정렬</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as 'walk' | 'wait')}>
            <option value="walk">거리순</option>
            <option value="wait">예상 대기시간순</option>
          </select>
        </label>
      </div>

      <div className="lot-grid">
        {rows.map(({ lot, st, ahead, wait, lv, zone }) => (
          <article key={lot.id} className="lot-card">
            <div className="lot-top">
              <Logo />
              <span className={`badge lv-${lv}`}>예시 · {LEVEL_LABEL[lv]}</span>
            </div>
            <h3>{lot.name}</h3>
            <p className="muted small">{lot.area} · 가능 {lot.capacity}대</p>
            <p className="small">
              {show.venue}까지 도보 약 <b>{lot.walkMin}분</b>
            </p>
            <div className="wait-box">
              <span className="small">
                과거 기록에서 만차였던 비율 <RealTag>실제</RealTag>
              </span>
              {zone ? (
                <>
                  <b>
                    {zone.fullRatio} <small>%</small>
                  </b>
                  <span className="muted small">
                    혼잡도 기록 {zone.total}건 중 만차 {zone.full}건{zone.fullHours.length > 0 && ` · 주로 ${zone.fullHours.join(', ')}`}
                  </span>
                </>
              ) : (
                <span className="muted small">이 구역의 기록이 없어요</span>
              )}
            </div>
            <p className="muted small demo-head">지금 현황 · 예시 값</p>
            <div className="lot-stats three">
              <div>
                <span className="muted small">잔여면</span>
                <b>{remaining(st)}면</b>
              </div>
              <div>
                <span className="muted small">앞선 대기</span>
                <b>{ahead}대</b>
              </div>
              <div>
                <span className="muted small">예상 대기</span>
                <b>
                  {wait[0]}–{wait[1]}분
                </b>
              </div>
            </div>
            <button type="button" className="disclosure" onClick={() => setOpenInfo(openInfo === lot.id ? null : lot.id)}>
              요금 · 운영시간 · 혼잡도 기록 <span>{openInfo === lot.id ? '▴' : '▾'}</span>
            </button>
            {openInfo === lot.id && (
              <ul className="info-list small">
                <li>{lot.hours}</li>
                <li>{lot.fee}</li>
                <li>♿ 장애인 전용 {lot.accessible}면 · 🤰 임산부 배려 {lot.family}면 (예시)</li>
                <li>가능 주차대수 {lot.capacity}대{lot.capacityNote ? ` (${lot.capacityNote})` : ''} · 공식 주차 안내 기준</li>
                {zone && (
                  <>
                    <li>
                      {zone.zone} 구역 기록: 원활 {zone.free} · 혼잡 {zone.busy} · 만차 {zone.full}건 ({zone.first} ~ {zone.last})
                    </li>
                    {zone.fullHours.length > 0 && <li>만차가 자주 기록된 시각: {zone.fullHours.join(', ')}</li>}
                  </>
                )}
              </ul>
            )}
            <div className="lot-actions">
              <Link to={`/parking/${lot.id}`} className="btn btn-outline">
                상세 보기 ›
              </Link>
              <Link to={`/queue?lot=${lot.id}`} className="btn btn-primary">
                온라인 대기 신청 →
              </Link>
            </div>
          </article>
        ))}
      </div>

      <p className="info-bar small">ⓘ 잔여면과 예상 대기시간은 입차를 보장하지 않습니다. 임시 배정면은 잔여면에서 제외됩니다.</p>

      <button type="button" className="disclosure wide" onClick={() => setTransitOpen(!transitOpen)}>
        차로 올까, 지하철로 올까 <span>{transitOpen ? '▴' : '▾'}</span>
      </button>
      {transitOpen && (
        <div className="panel">
          <p className="small muted">예상 대기가 가장 짧은 {best.lot.name} 기준</p>
          <TransitCompare venue={show.venue} wait={best.wait} walk={best.lot.walkMin} />
        </div>
      )}
    </div>
  )
}
