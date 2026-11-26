import { useSyncExternalStore } from 'react'

/** 화면 밝기: 기본은 밝게(light). 상단 버튼으로 야간 모드(dark)로 바꾸면 이 브라우저에 기억한다 */
export type Theme = 'light' | 'dark'
const KEY = 'olpark-theme'
const listeners = new Set<() => void>()

function read(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

let current: Theme = read()

export function applyTheme() {
  document.documentElement.dataset.theme = current
}

export function setTheme(t: Theme) {
  current = t
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* 저장이 막힌 브라우저에서는 이번 방문 동안만 유지 */
  }
  applyTheme()
  listeners.forEach((f) => f())
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f)
      return () => listeners.delete(f)
    },
    () => current,
  )
}
