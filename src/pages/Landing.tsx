import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PARKLOG } from '../history'
import { LiveLine } from '../live'
import { UNITY_FILES } from '../ui'

/** 화면에 들어올 때 한 번 떠오르는 구역 */
function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!('IntersectionObserver' in window)) {
      el.classList.add('in')
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.classList.add('in')
          io.disconnect()
        }
      },
      { threshold: 0.15 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={`reveal ${className}`}>
      {children}
    </div>
  )
}

// 타자 치듯 나오는 제목: 질문 하나를 치고 지운 뒤 답을 치고 멈춘다 (계속 돌면 답을 읽을 틈이 없다)
const ANSWER = '차로 갈지 말지,\n먼저 알려드려요'
const ACCENT_FROM = ANSWER.indexOf('먼저') // 답에서는 여기부터 강조색
const QUESTIONS = ['공연 날 주차,\n아직도 답답하죠?', '주차 줄에서\n공연 시작을 놓쳤나요?', '어디가 비었는지\n돌아다니셨나요?']

function TypedTitle() {
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [text, setText] = useState(reduce ? ANSWER : '')
  const [answering, setAnswering] = useState(reduce)
  const [done, setDone] = useState(reduce)
  // 들어올 때마다 질문 하나를 고른다
  const [question] = useState(() => QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)])

  useEffect(() => {
    if (reduce) return
    let stop = false
    const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
    const type = async (line: string) => {
      for (let i = 1; i <= line.length && !stop; i++) {
        setText(line.slice(0, i))
        await wait(line[i - 1] === '\n' ? 260 : 82)
      }
    }
    ;(async () => {
      await wait(350)
      setAnswering(false)
      await type(question)
      await wait(1300)
      for (let i = question.length - 1; i >= 0 && !stop; i--) {
        setText(question.slice(0, i))
        await wait(40)
      }
      await wait(300)
      if (stop) return
      setAnswering(true)
      await type(ANSWER)
      if (!stop) setDone(true)
    })()
    return () => {
      stop = true
    }
  }, [reduce, question])

  // 줄바꿈과 강조색을 반영해 지금까지 친 글자를 그린다
  const plain = answering ? text.slice(0, ACCENT_FROM) : text
  const accent = answering ? text.slice(ACCENT_FROM) : ''
  const [first, second] = plain.split('\n')
  return (
    <h1 className="lp-typed" aria-label={ANSWER.replace('\n', ' ')}>
      <span aria-hidden>
        {first}
        {second !== undefined && <br />}
        {second}
        {accent && <span className="accent">{accent}</span>}
        <i className={'caret' + (done ? ' done' : '')} />
      </span>
    </h1>
  )
}

const FEATURES = [
  {
    n: '01',
    title: '차로 갈지, 지하철로 갈지 먼저 알려드려요',
    body: `같은 요일·같은 시각의 실제 입출차 기록 ${PARKLOG.total.toLocaleString()}건과 지금 실시간 주차대수를 합쳐, 도착할 때 공원이 얼마나 붐빌지 보고, 붐비면 대중교통을 먼저 권해요.`,
  },
  {
    n: '02',
    title: '차가 꼭 필요하면 3D 지도에서 주차장을 고릅니다',
    body: '실제 건물과 주차장 윤곽으로 만든 올림픽공원 3D 지도에서, 공연장과 가까운 곳·과거에 덜 붐빈 곳을 한눈에 비교해요.',
  },
  {
    n: '03',
    title: '로그인 없이 바로 예약합니다',
    body: '전화번호와 차량번호만 넣으면 대기번호가 나와요. 차 안에서 기다리지 않고, 출발 전에 순서를 확인할 수 있어요.',
  },
  {
    n: '04',
    title: '대중교통이 어려운 분께는 주차를 먼저',
    body: '장애인·임산부 전용 주차면을 고르면 혼잡과 상관없이 예약을 먼저 도와드리고, 요금 할인과 휠체어 진입로까지 알려드려요.',
  },
]

const STEPS = ['공연을 고릅니다', '도착 시각을 넣으면 대중교통·자동차 중 무엇이 좋을지 알려드려요', '차로 간다면 3D 지도에서 주차장을 고릅니다', '전화번호·차량번호로 예약합니다']

const DATA = [
  ['올림픽공원 실시간 주차현황', '지금 공원에 주차 중인 차량 수'],
  ['올림픽공원 입출차 정보', `2024년 7월 ${PARKLOG.total.toLocaleString()}건의 시간대별 패턴`],
  ['주차장 혼잡도 정보', '주차구역별 원활·혼잡·만차 기록'],
  ['월별주차현황', '연도·월별 주차대수'],
]

/** 첫 화면: 한 줄 소개와 시작 버튼, 스크롤하면 앱 소개 */
export default function Landing() {
  // 소개를 읽는 동안 3D 지도 파일을 자동으로 미리 받기 시작한다 (지원하는 브라우저에서만 동작)
  useEffect(() => {
    const links = UNITY_FILES.map((href) => {
      const l = document.createElement('link')
      l.rel = 'prefetch'
      l.href = href
      document.head.appendChild(l)
      return l
    })
    return () => links.forEach((l) => l.remove())
  }, [])

  return (
    <div className="landing">
      <section className="lp-hero">
        <p className="lp-eyebrow rise" style={{ animationDelay: '0ms' }}>
          올림픽공원 공연 관람객을 위한 가는 길 안내
        </p>
        <TypedTitle />
        <p className="lp-sub rise" style={{ animationDelay: '260ms' }}>
          안녕하세요, 올팍패스입니다.
          <br />
          붐비는 날엔 대중교통을, 꼭 차가 필요할 땐 주차 예약을.
        </p>
        <div className="rise" style={{ animationDelay: '400ms' }}>
          <Link to="/start" className="btn btn-primary lp-cta">
            공연 고르기
          </Link>
        </div>
        <div className="rise lp-live" style={{ animationDelay: '540ms' }}>
          <LiveLine />
        </div>
        <a href="#about" className="lp-scroll" aria-label="아래로 스크롤해 소개 보기">
          ⌄
        </a>
      </section>

      <section id="about" className="lp-section">
        <Reveal>
          <p className="eyebrow">WHAT WE DO</p>
          <h2>주차 걱정, 이렇게 덜어드려요</h2>
        </Reveal>
        {FEATURES.map((f) => (
          <Reveal key={f.n} className="lp-feature">
            <span className="lp-num">{f.n}</span>
            <div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          </Reveal>
        ))}
      </section>

      <section className="lp-section lp-tint">
        <Reveal>
          <p className="eyebrow">HOW IT WORKS</p>
          <h2>네 단계면 끝나요</h2>
        </Reveal>
        <Reveal>
          <ol className="lp-steps">
            {STEPS.map((s, i) => (
              <li key={s}>
                <i>{i + 1}</i>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </Reveal>
      </section>

      <section className="lp-section">
        <Reveal>
          <p className="eyebrow">OPEN DATA</p>
          <h2>한국체육산업개발 공공데이터로 만들었어요</h2>
        </Reveal>
        <Reveal>
          <ul className="lp-data">
            {DATA.map(([name, use]) => (
              <li key={name}>
                <b>{name}</b>
                <span>{use}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">공연 일정과 주차장별 잔여면은 시연용 예시 값이며, 화면에 "예시"로 표시합니다.</p>
        </Reveal>
      </section>

      <section className="lp-section lp-end">
        <Reveal>
          <h2>이제 공연을 골라 볼까요?</h2>
          <Link to="/start" className="btn btn-primary lp-cta">
            공연 고르기
          </Link>
        </Reveal>
      </section>
    </div>
  )
}
