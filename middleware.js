// 사이트 전체 비밀번호 관문 (Vercel Routing Middleware).
// Vercel 환경변수 SITE_PASSWORD 가 설정돼 있으면, 브라우저의 기본 로그인 창에서 그 비밀번호를 입력해야 들어올 수 있다.
// 아이디 칸은 아무 값이나 넣어도 된다. 환경변수를 지우고 다시 배포하면 공개 상태로 돌아간다.
export const config = { matcher: '/(.*)' }

export default function middleware(request) {
  const password = process.env.SITE_PASSWORD
  if (!password) return // 미설정: 공개

  const header = request.headers.get('authorization') || ''
  if (header.startsWith('Basic ')) {
    try {
      const decoded = new TextDecoder().decode(Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0)))
      const given = decoded.slice(decoded.indexOf(':') + 1)
      if (given === password) return // 통과
    } catch {
      // 잘못된 헤더는 아래에서 다시 묻는다
    }
  }
  return new Response('비밀번호가 필요한 페이지입니다.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="OlparkParking", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
