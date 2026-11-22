import { useState } from 'react'
import { BIKE_STATIONS, SHOWS, bikeStationsFor, showById } from '../data'
import { KakaoRouteButton, placeAt } from '../kakao'
import { RouteFinder } from '../route'
import { useApp } from '../store'
import { RealTag } from '../ui'

const VENUES = [...new Set(SHOWS.map((s) => s.venue))]
const FIRST = 6 // 처음에 보여줄 대여소 수 (공연장에서 가까운 순서)

/**
 * 자전거 대여소: 올림픽공원 둘레의 따릉이 대여소를 공연장에서 가까운 순서로 보여준다.
 * 대여소를 누르면 그 아래에 내 위치 → 대여소 길찾기(대중교통 길찾기와 같은 화면)가 열린다.
 */
export default function Bike() {
  const { trip } = useApp()
  const [venue, setVenue] = useState(showById(trip.showId).venue)
  const [picked, setPicked] = useState<string | null>(null) // 고른 대여소 번호
  const [all, setAll] = useState(false)

  const stations = bikeStationsFor(venue)
  // 고른 대여소가 접힌 목록 밖에 있으면 사라지지 않게 전체를 보여준다
  const shown = all || stations.findIndex((s) => s.no === picked) >= FIRST ? stations : stations.slice(0, FIRST)

  return (
    <div className="container section narrow">
      <p className="eyebrow">BIKE</p>
      <h1 className="page-title">자전거 대여소</h1>
      <p className="muted">
        올림픽공원 둘레의 따릉이 대여소 {BIKE_STATIONS.length}곳이에요. 자전거로 오면 주차 걱정이 없어요.
      </p>

      <div className="bike-venues" role="group" aria-label="도착할 공연장">
        {VENUES.map((v) => (
          <button key={v} type="button" className={'btn btn-sm btn-outline' + (v === venue ? ' on' : '')} aria-pressed={v === venue} onClick={() => setVenue(v)}>
            {v}
          </button>
        ))}
      </div>

      <div className="section-head bike-head">
        <b>{venue}에서 가까운 순서</b>
        <RealTag>OpenStreetMap 실제 위치</RealTag>
      </div>
      <p className="muted small">대여소를 누르면 내 위치에서 그곳까지 길찾기를 해요 (위치는 저장하지 않아요).</p>

      <ul className="stations bike-list">
        {shown.map((s, i) => {
          const on = s.no === picked
          const place = placeAt(`${s.name} 따릉이 대여소`, s.x, s.z)
          return (
            <li key={s.no} className={'pick bike-item' + (i === 0 ? ' best' : '') + (on ? ' on' : '')}>
              <button type="button" aria-expanded={on} onClick={() => setPicked(on ? null : s.no)}>
                <span className="station-name">
                  <b>🚲 {s.name}</b>
                  <span className="tag">대여소 번호 {s.no}</span>
                  <span className="tag">거치대 {s.racks}대</span>
                  {i === 0 && <span className="tag tag-real">가장 가까움</span>}
                </span>
                <span className="station-walk">
                  걸어서 약 <b>{s.walkMin}분</b>
                  <span className="station-go">{on ? '닫기' : '눌러서 길찾기 →'}</span>
                </span>
              </button>
              {on && (
                <div className="bike-route">
                  <b>{s.name} 대여소까지 길찾기</b>
                  <p className="small">출발지를 정하면 걸리는 시간과 탈 버스 번호·지하철을 알려드려요.</p>
                  {/* 공연장을 바꾸면 걷는 시간이 달라지므로 다시 만든다 */}
                  <RouteFinder key={venue} venue={venue} dest={{ place, walkMin: s.walkMin }} />
                  <KakaoRouteButton mode="bicycle" to={place}>
                    🚲 카카오맵에서 자전거 길 보기
                  </KakaoRouteButton>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {shown.length < stations.length && (
        <button type="button" className="btn btn-outline bike-more" onClick={() => setAll(true)}>
          대여소 {stations.length}곳 모두 보기
        </button>
      )}

      <p className="info-bar small">
        남은 자전거 대수는 여기서 알 수 없어요. 출발 전에{' '}
        <a className="link" href="https://www.bikeseoul.com" target="_blank" rel="noreferrer">
          따릉이 앱·누리집
        </a>
        에서 확인해 주세요. 걷는 시간은 직선거리로 계산한 추정값이고 실제 경로가 아니에요.
      </p>
      <p className="muted small">
        대여소 위치·번호·거치대 수: ©{' '}
        <a className="link" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>{' '}
        기여자 (2026년 11월 기준)
      </p>
    </div>
  )
}
