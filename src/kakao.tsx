import { useState } from 'react'
import type { ReactNode } from 'react'
import { venuePos } from './data'

// 카카오맵 길찾기 링크. 앱 키 없이 열리는 공개 링크(https://map.kakao.com/link/...)만 쓰므로 비용과 인증키가 필요 없다.
//   도착지만:     /link/to/이름,위도,경도
//   출발지 포함:  /link/by/{car|traffic|walk}/이름,위도,경도/이름,위도,경도   (traffic = 대중교통)
// 사용자 환경에 따라 카카오맵 앱 또는 모바일/PC 웹 지도로 열린다.

// 3D 지도 좌표계(x=동쪽 m, z=북쪽 m) → 위도·경도. 원점과 환산 계수는 unity-project/tools/convert.cjs 와 같다.
const LAT0 = 37.5185
const LON0 = 127.1215
const M_PER_DEG_LON = Math.cos((LAT0 * Math.PI) / 180) * 111320
const M_PER_DEG_LAT = 110574

export type Place = { name: string; lat: number; lng: number }
export type Mode = 'traffic' | 'car' | 'walk'

export const placeAt = (name: string, x: number, z: number): Place => ({ name, lat: LAT0 + z / M_PER_DEG_LAT, lng: LON0 + x / M_PER_DEG_LON })
export const venuePlace = (venue: string): Place => {
  const [x, z] = venuePos(venue)
  return placeAt(venue, x, z)
}

// 이름에 쉼표나 슬래시가 있으면 링크 구분자와 섞이므로 공백으로 바꾼다
const seg = (p: Place) => `${encodeURIComponent(p.name.replace(/[,/]/g, ' '))},${p.lat.toFixed(6)},${p.lng.toFixed(6)}`
export const kakaoTo = (to: Place) => `https://map.kakao.com/link/to/${seg(to)}`
export const kakaoBy = (mode: Mode, from: Place, to: Place) => `https://map.kakao.com/link/by/${mode}/${seg(from)}/${seg(to)}`

/** 현재 위치. 허락하지 않았거나 못 가져오면 null. 누른 순간에만 한 번 묻고 어디에도 저장하지 않는다 */
function locate(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    )
  })
}

/**
 * 내 위치에서 도착지까지 카카오맵 길찾기를 연다.
 * 위치를 못 가져오면 도착지만 담아 열어서, 출발지는 카카오맵에서 정하게 한다.
 */
export function KakaoRouteButton({ mode, to, from, primary, note, children }: { mode: Mode; to: Place; from?: Place; primary?: boolean; note?: string; children: ReactNode }) {
  const [busy, setBusy] = useState(false)
  const [fallback, setFallback] = useState(false)

  const go = async () => {
    setBusy(true)
    setFallback(false)
    // 위치를 기다리는 동안 팝업 차단에 걸리지 않도록, 누른 즉시 빈 창부터 연다
    const win = window.open('', '_blank')
    // 출발지를 이미 정했으면 그대로 쓰고, 아니면 내 위치를 한 번 묻는다
    const start: Place | null = from ?? (await locate().then((p) => (p ? { name: '내 위치', ...p } : null)))
    const url = start ? kakaoBy(mode, start, to) : kakaoTo(to)
    if (!start) setFallback(true)
    if (win) {
      win.opener = null
      win.location.href = url
    } else {
      window.location.href = url
    }
    setBusy(false)
  }

  return (
    <div className="kakao-route">
      <button type="button" className={'btn ' + (primary ? 'btn-primary' : 'btn-outline')} onClick={go} disabled={busy}>
        {busy ? '내 위치를 확인하는 중…' : children}
      </button>
      {fallback && (
        <p className="small kakao-fallback" role="status">
          내 위치를 가져오지 못해 도착지만 열었어요. 출발지는 카카오맵에서 정해 주세요.
        </p>
      )}
      <p className="muted small">
        {from ? (
          '정한 출발지와 도착지로 카카오맵을 열어요.'
        ) : (
          <>
            누르면 내 위치를 카카오맵으로 넘겨요. 이 서비스는 위치를 저장하지 않아요.{' '}
            <a className="link" href={kakaoTo(to)} target="_blank" rel="noreferrer">
              출발지를 직접 정할래요
            </a>
          </>
        )}
        {note && <> · {note}</>}
      </p>
    </div>
  )
}
