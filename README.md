# 올팍 파킹패스

올림픽공원 공연 관람객을 위한 주차 혼잡 안내 서비스 (시연용).
한국체육산업개발(주) 2026 공공데이터 활용 경진대회 출품 준비작입니다. 기관의 공식 서비스가 아닙니다.

제작: 울산대학교 ICT융합학부 팀 김손추 (김기백 · 손현 · 추재현)

## 기능

- 도착 시각 혼잡 예측: 같은 요일·같은 시각의 과거 실제 기록 + 실시간 주차대수 보정
- 공원 전체 실시간 주차대수 표시
- 시간대별 입차·출차 패턴, 평일·주말 비교, 주차구역별 혼잡도 기록
- 3D 공원 지도(Unity WebGL): 실제 건물·주차장 윤곽, 주차장을 눌러 바로 대기 예약
- 온라인 대기(대기번호)와 관리자 화면 — 시연용, 브라우저에만 저장

## 데이터

| 데이터 | 출처 | 쓰는 곳 |
|---|---|---|
| 올림픽공원 실시간 주차현황 | 한국체육산업개발 공개 API | `api/parking.js` |
| 올림픽공원 입출차 정보 (2024년 7월, 215,528건) | 공공데이터포털 파일데이터 | `data-raw/` → `src/parking-data.json` |
| 주차장 혼잡도 정보 | 공공데이터포털 파일데이터 | 위와 같음 |
| 월별주차현황 | 공공데이터포털 파일데이터 | 위와 같음 |
| 건물·주차장·호수·도로 윤곽 | © OpenStreetMap 기여자 (ODbL) | `unity-project/tools/` → 3D 지도 |

예시 값(실제 데이터 아님): 공연 일정, 주차장별 잔여면·요금·대기 차량, 대중교통 시간. 화면에서 "예시"로 표시됩니다.

## 폴더

- `src/` 웹 화면 (React + Vite)
- `api/` 서버 함수 (Vercel). `_lib.js` 에 공공데이터 호출 로직
- `middleware.js` 사이트 비밀번호 관문
- `tools/build-history.mjs` CSV 집계 → `src/parking-data.json`
- `public/unity/` 3D 지도 WebGL 빌드 결과
- `unity-project/` Unity 프로젝트 (Unity 6000.6.9f1). `tools/convert.cjs` 가 지도 윤곽을 `Assets/Resources/park.json` 으로 변환

## 실행

```
npm install
npm run dev
```

과거 기록을 다시 집계하려면 `node tools/build-history.mjs`.

3D 지도를 다시 빌드하려면 Unity 에디터 메뉴 "올팍 3D > 브라우저용(WebGL) 빌드" 실행 후
`unity-project/Build/WebGL/Build/` 의 파일을 `public/unity/Build/` 로 복사하고, `public/unity/index.html` 의 `V` 값을 올립니다.

## 환경변수 (Vercel)

| 이름 | 용도 |
|---|---|
| `SITE_PASSWORD` | 설정하면 사이트 전체에 비밀번호가 걸립니다. 지우면 공개 |
| `KCISA_KEY_SHOWS`, `KCISA_KEY_LINKED`, `KCISA_KEY_PARKLOG` | 문화공공데이터광장 서비스키 (현재 화면에서는 미사용) |
| `OLPARK_LIVE_BASELINE` | 실시간 주차대수에서 빼는 기준치 (기본 1060) |

로컬에서는 `.env.example` 을 `.env.local` 로 복사해 채웁니다.
