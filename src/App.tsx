import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { lotById } from './data'
import Admin from './pages/Admin'
import Home from './pages/Home'
import Landing from './pages/Landing'
import Map3D from './pages/Map3D'
import Parking from './pages/Parking'
import ParkingDetail from './pages/ParkingDetail'
import Queue from './pages/Queue'
import { Layout } from './ui'

function PageMeta() {
  const { pathname } = useLocation()
  useEffect(() => {
    const detail = pathname.match(/^\/parking\/(.+)$/)
    const title = detail
      ? `${lotById(detail[1])?.name ?? '주차장'} 상세`
      : ({ '/': '공연 가는 길, 주차부터', '/start': '공연 고르기', '/parking': '주차장 비교', '/queue': '내 온라인 대기', '/admin': '관리자 시연', '/map': '도착 시각과 주차장' }[pathname] ?? '올팍패스')
    document.title = `${title} | 올팍패스`
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <PageMeta />
      <Layout>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/start" element={<Home />} />
          <Route path="/map" element={<Map3D />} />
          <Route path="/parking" element={<Parking />} />
          <Route path="/parking/:id" element={<ParkingDetail />} />
          <Route path="/queue" element={<Queue />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/map3d" element={<Navigate to="/map" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
