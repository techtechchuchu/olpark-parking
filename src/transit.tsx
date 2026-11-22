import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Need } from './data'
import { NEED_LABEL } from './data'
import { LEVEL_CLASS } from './forecast'
import { FORECAST_LEVEL } from './history'
import type { Forecast } from './history'
import { RouteFinder } from './route'

type Advice = { pick: 'transit' | 'car'; tone: 'busy' | 'normal' | 'free' | 'need'; title: string; body: string }

/** 혼잡 예측으로 "대중교통 / 자동차" 중 무엇을 권할지 정한다. 숫자는 절대 대수 대신 관측 최대 대비 비율로 말한다 */
export function advise(f: Forecast | null, need: Need): Advice {
  if (need !== 'none') {
    return { pick: 'car', tone: 'need', title: `${NEED_LABEL[need]} 주차면을 먼저 안내해 드려요`, body: '대중교통 이용이 어려운 분들을 위해 전용 주차면 예약을 우선 도와드려요.' }
  }
  if (!f) return { pick: 'transit', tone: 'normal', title: '대중교통을 권해요', body: '예측 정보를 불러오지 못했어요. 공연 날에는 주차장이 붐비는 경우가 많아요.' }
  const when = `${f.dowName}요일 ${f.hour}시 공원 주차는 관측 최대의 ${f.percent}% 수준`
  if (f.level === 'busy') return { pick: 'transit', tone: 'busy', title: '많이 붐벼요. 대중교통을 추천해요', body: `${when}이에요. 주차장을 찾아 돌거나 입구에서 기다릴 수 있어요.` }
  if (f.level === 'normal') return { pick: 'transit', tone: 'normal', title: '붐비기 시작해요. 대중교통이 더 편해요', body: `${when}이에요. 가까운 주차장은 자리가 없을 수 있어요.` }
  return { pick: 'car', tone: 'free', title: '여유 있어요. 차로 와도 괜찮아요', body: `${when}으로 한산해요.` }
}

/**
 * 가는 방법 판정: 답 하나(권하는 방법)와 버튼 둘만 먼저 보여주고, 근거(혼잡 예측·실시간 주차대수)는 접어 둔다.
 * 대중교통을 고르면 카카오맵 길찾기로 이어지고, 공원 안 위치는 우리 지도(OpenStreetMap)가 맡는다.
 * onCar: "차로 갈게요"를 눌렀을 때 (지도 단계로 이동)
 * children: "근거 보기"를 펼치면 보이는 내용
 */
export function TravelAdvice({ forecast, need, venue, onCar, children }: { forecast: Forecast | null; need: Need; venue: string; onCar: () => void; children?: ReactNode }) {
  const [showTransit, setShowTransit] = useState(false)
  const a = advise(forecast, need)
  const transitBtn = (
    <button type="button" className={'btn ' + (a.pick === 'transit' ? 'btn-primary' : 'btn-outline')} aria-expanded={showTransit} onClick={() => setShowTransit(true)}>
      🚇 대중교통으로 갈게요
    </button>
  )
  const carBtn = (
    <button type="button" className={'btn ' + (a.pick === 'car' ? 'btn-primary' : 'btn-outline')} onClick={onCar}>
      🚗 {a.pick === 'car' ? '차로 갈게요 · 주차장 고르기 →' : '그래도 차로 갈게요 →'}
    </button>
  )
  return (
    <section className={`advice tone-${a.tone}`} aria-live="polite">
      {forecast && (
        <div className="advice-head">
          <span className={`badge ${LEVEL_CLASS[forecast.level]}`}>● {FORECAST_LEVEL[forecast.level]}</span>
          <span className="muted small">
            {forecast.dowName}요일 {forecast.hour}시 도착
          </span>
        </div>
      )}
      <h2>{a.title}</h2>
      <p className="small">{a.body}</p>
      {forecast?.better && a.pick === 'transit' && (
        <p className="small">
          차로 와야 한다면 <b>{forecast.better.hour}시</b>에 도착하는 편이 더 한산해요.
        </p>
      )}
      <div className="advice-actions">
        {a.pick === 'transit' ? transitBtn : carBtn}
        {a.pick === 'transit' ? carBtn : transitBtn}
      </div>
      {showTransit && (
        <div className="transit-guide">
          <b>길찾기</b>
          <p className="small">출발지를 정하면 걸리는 시간과 탈 버스 번호·지하철을 알려드려요.</p>
          <RouteFinder venue={venue} />
          <p className="muted small">공연이 끝난 직후에는 역이 붐벼요. 10~20분 여유를 두면 편해요.</p>
        </div>
      )}
      {children && (
        <details className="advice-why">
          <summary>근거 보기</summary>
          {children}
        </details>
      )}
      {forecast && <p className="muted small advice-note">2024년 7월 실제 기록으로 예측한 값이고, 입차를 보장하지 않아요.</p>}
    </section>
  )
}
