import { useState } from 'react'
import { showById } from './data'
import { FORECAST_LEVEL, forecast } from './history'
import { useLiveParking } from './live'
import { useApp } from './store'
import { RealTag } from './ui'

const LEVEL_CLASS = { free: 'lv-free', normal: 'lv-busy', busy: 'lv-full' } as const

/** 지금 고른 공연·도착 시각의 혼잡 예측 값 */
export function useForecast() {
  const app = useApp()
  const live = useLiveParking()
  const show = showById(app.trip.showId)
  const liveAdjusted = live.status === 'ok' ? Math.max(0, live.parkingSum - live.baseline) : null
  return forecast(app.trip.date, app.trip.arrive, show.time, liveAdjusted)
}

/** 지도 화면용 요약. 누르면 자세한 예측 패널이 펼쳐진다 */
export function ForecastLine() {
  const app = useApp()
  const live = useLiveParking()
  const [open, setOpen] = useState(false)
  const show = showById(app.trip.showId)
  const liveAdjusted = live.status === 'ok' ? Math.max(0, live.parkingSum - live.baseline) : null
  const f = forecast(app.trip.date, app.trip.arrive, show.time, liveAdjusted)
  if (!f) return null
  return (
    <>
      <button type="button" className="forecast-line" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`badge ${LEVEL_CLASS[f.level]}`}>● {FORECAST_LEVEL[f.level]}</span>
        <span className="forecast-line-text">
          <b>
            {f.dowName}요일 {f.hour}시 도착 예상: 공원에 약 {f.expected.toLocaleString()}대
          </b>
          <span className="muted small">
            {f.better ? `${f.better.hour}시에 오면 ${f.better.diff.toLocaleString()}대 적어요` : `관측 최대의 ${f.percent}% 수준`} · {f.adjust.applied ? '실제 기록 + 실시간 보정' : '2024년 7월 실제 기록 기반'}
          </span>
        </span>
        <span aria-hidden>{open ? '▴' : '▾'}</span>
      </button>
      {open && <ForecastPanel />}
    </>
  )
}

/** 도착 예정 시각의 공원 전체 혼잡 예측. 과거 실제 기록 + (방문일이 오늘이면) 실시간 주차대수 보정 */
export function ForecastPanel() {
  const app = useApp()
  const live = useLiveParking()
  const show = showById(app.trip.showId)
  const liveAdjusted = live.status === 'ok' ? Math.max(0, live.parkingSum - live.baseline) : null
  const f = forecast(app.trip.date, app.trip.arrive, show.time, liveAdjusted)
  if (!f) return null

  return (
    <section className="panel past-panel" aria-label="도착 시각 혼잡 예측">
      <div className="panel-head">
        <h3>
          {f.dowName}요일 {f.hour}시 도착, 공원 주차 혼잡 예측
        </h3>
        <RealTag>{f.adjust.applied ? '실제 기록 + 실시간 보정' : '2024년 7월 실제 기록 기반'}</RealTag>
      </div>
      <div className="forecast-main">
        <div className="forecast-level">
          <span className={`badge ${LEVEL_CLASS[f.level]}`}>● {FORECAST_LEVEL[f.level]}</span>
          <b>
            약 {f.expected.toLocaleString()}대 <small>주차 중 예상</small>
          </b>
          <span className="muted small">
            같은 요일 {f.samples}일의 범위 {f.low.toLocaleString()}~{f.high.toLocaleString()}대
          </span>
        </div>
        <div className="forecast-meter">
          <div className="meter" role="img" aria-label={`관측 최대치 대비 ${f.percent}%`}>
            <i className={LEVEL_CLASS[f.level]} style={{ width: `${Math.min(100, f.percent)}%` }} />
          </div>
          <span className="small">
            관측 최대 {f.observedMax.toLocaleString()}대의 <b>{f.percent}%</b> 수준
          </span>
          <span className="muted small">
            이 시간대는 {f.netPerHour >= 0 ? `들어오는 차가 시간당 약 ${f.netPerHour}대 더 많아요` : `나가는 차가 시간당 약 ${-f.netPerHour}대 더 많아요`}
          </span>
        </div>
      </div>
      {f.better && (
        <p className="info-bar small tip">
          💡 <b>{f.better.hour}시</b>에 도착하면 약 {f.better.expected.toLocaleString()}대로, 지금 계획보다 <b>{f.better.diff.toLocaleString()}대</b> 적은 시간대예요.
        </p>
      )}
      <p className="muted small">
        {f.adjust.applied
          ? `지금 실시간 주차대수가 같은 요일·같은 시각 과거 평균의 ${Math.round((f.adjust.ratio ?? 1) * 100)}% 수준이라, 그 비율만큼 조정했습니다.`
          : `실시간 보정 없음: ${f.adjust.reason}.`}{' '}
        공원 전체(동2문·남2문·북2문 합계) 기준의 단순 통계이며 입차를 보장하지 않습니다.
      </p>
    </section>
  )
}
