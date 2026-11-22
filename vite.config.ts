import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'

// 로컬 개발 서버에서도 /api/* 가 동작하도록, Vercel 함수와 같은 로직(api/_lib.js)을 그대로 호출한다.
function localApi(): Plugin {
  return {
    name: 'olpark-local-api',
    configureServer(server) {
      // .env.local 에 적은 키를 로컬 API 에서도 쓰도록 읽어 둔다 (브라우저로는 나가지 않음)
      const env = loadEnv('development', process.cwd(), ['KCISA_', 'OLPARK_', 'KAKAO_'])
      for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (!url.pathname.startsWith('/api/')) return next()
        const lib = await import(/* @vite-ignore */ new URL('./api/_lib.js', import.meta.url).href)
        const routes: Record<string, () => Promise<{ ok: boolean }>> = {
          '/api/parking': () => lib.getParking(),
          '/api/shows': () => lib.getShows(),
          '/api/linked': () => lib.getLinked(Number(url.searchParams.get('page')) || 1),
          '/api/place': () => lib.searchPlace(url.searchParams.get('q')),
          '/api/transit': () => lib.getTransit({ sx: url.searchParams.get('sx'), sy: url.searchParams.get('sy'), ex: url.searchParams.get('ex'), ey: url.searchParams.get('ey') }),
        }
        const run = routes[url.pathname]
        if (!run) {
          res.statusCode = 404
          return res.end('{"ok":false,"reason":"not-found"}')
        }
        const data = await run()
        res.statusCode = data.ok ? 200 : 502
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(data))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localApi()],
  // Unity 프로젝트 폴더(파일 수만 개)는 개발 서버가 감시하지 않게 한다
  server: { watch: { ignored: ['**/unity-project/**', '**/data-raw/**'] } },
})
