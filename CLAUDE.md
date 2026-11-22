# 올팍패스 — Claude 작업 안내

한국체육산업개발(주) 2026 공공데이터 활용 경진대회 출품작 (마감 2026-12-01 18:00).
울산대학교 ICT융합학부 팀 김손추 (김기백 · 손현 · 추재현). 팀원 누구나 이 저장소를 받아 Claude 와 이어서 작업한다.

방향: 올림픽공원 공연 관람객에게 **대중교통을 먼저 권하고**, 차가 꼭 필요한 사람만 주차 예약으로 안내한다.
심사 기준은 데이터 활용 우수성 · 구체성 · 독창성 · 실현가능성 · 공익성. 실제로 동작하는 화면이 중요하다.

## 대화와 글

- 팀원과는 한국어로 대화하고, 화면 문구·주석·커밋 메시지도 한국어로 쓴다.
- 화면 문구는 "~해요" 말투. 휴대폰 폭(최대 480px) 화면만 만든다. PC 에서도 같은 폭으로 보인다.

## 꼭 지킬 것

- **돈이 드는 것은 넣지 않는다.** 유료 API · 도메인 · 요금제는 팀원에게 먼저 묻는다. 기본은 무료.
- **인증키·비밀번호를 대화나 코드에 적지 않는다.** `.env.local`(git 제외) 또는 Vercel 환경변수에만 둔다. 값을 출력하지 않는다.
- **실제 데이터와 예시 값을 섞지 않는다.** 실제 기록에는 `RealTag`, 지어낸 값에는 `DemoTag`("예시")를 붙인다.
  예시인 것: 공연 일정, 주차장별 잔여면, 주차면 배치, 장애인·임산부 주차면 수, 대기 순서.
- **지도 출처 표기를 지우지 않는다.** 하단의 "© OpenStreetMap 기여자" 는 라이선스(ODbL) 의무다.
- 위성사진, 기관 로고는 허락 없이 넣지 않는다.
- 사이트는 출품 전까지 비밀번호(`SITE_PASSWORD`)로 잠겨 있다. `middleware.js` 를 풀지 않는다.

## 실행과 확인

```
npm install
npm run dev        # 로컬 화면. Claude 데스크톱 앱에서는 preview_start 의 "olpark-parking" (포트 5183)
npm run build      # 타입 검사 + 빌드. 커밋 전에 반드시 통과시킨다
```

인증키 없이도 화면은 모두 뜬다 (실시간 주차대수 API 는 공개 키를 쓴다).

화면을 고쳤으면 브라우저에서 직접 확인한 뒤 끝낸다. 3D 지도는 `/map?view=map`.

## 구조

| 위치 | 내용 |
|---|---|
| `src/data.ts` | 공연(예시), 주차장 8곳, 공연장 좌표, 지하철역 `STATIONS`, 버스 정류장 `BUS_STOPS`, 따릉이 대여소 `BIKE_STATIONS` |
| `src/store.ts` | 예약·대기 상태. 브라우저 `localStorage` 에만 저장 (서버 없음). 예약 규칙 상수도 여기 |
| `src/history.ts` | 과거 실제 기록 분석과 혼잡 예측 `forecast()`. 원본은 `src/parking-data.json` |
| `src/transit.tsx` | 대중교통/자동차 판정 `advise()`, 역·정류장 목록 |
| `src/pages/` | `Landing`(소개) → `Home`(공연) → `Map3D`(가는 방법 · 3D 지도 · 예약) / `Bike`(자전거 대여소 · 길찾기) / `Parking` · `Queue` · `Admin` |
| `src/ui.tsx` | 공통 틀, 단계 표시, `UNITY_V` |
| `api/` | Vercel 서버 함수. 공공데이터 호출은 `_lib.js` |
| `public/unity/` | 3D 지도 WebGL 빌드 결과와 그것을 감싸는 `index.html` (이름표, 마우스·터치 조작) |
| `unity-project/` | Unity 6000.6.9f1 프로젝트. 장면은 `Assets/Scripts/ParkScene.cs` 가 `Resources/park.json` 으로 만든다 |
| `unity-project/tools/` | OpenStreetMap 받기(`fetch-*.ps1`)와 변환(`convert.cjs`) |
| `tools/build-history.mjs` | `data-raw/*.csv` → `src/parking-data.json` |

좌표계: 3D 지도와 `data.ts` 모두 x = 동쪽(m), z = 북쪽(m), 원점은 위도 37.5185 · 경도 127.1215.

예약 규칙(`store.ts`): 공연 이틀 전~하루 전에만 예약, 최대 8시간, 예약 시각 10분 뒤까지 안 오면 취소, 미루기 1회 30분.

## 3D 지도를 고칠 때

- 이름표는 Unity 안이 아니라 `public/unity/index.html` 의 HTML 로 그린다 (Unity 글꼴은 한글이 깨진다).
- 웹 → Unity: `SendMessage('Park', 'SetParking', json)`. 보내는 내용은 `Map3D.tsx` 에서 만든다.
- `ParkScene.cs` 를 고쳤으면 다시 빌드해야 한다. Unity 가 설치되고 Unity Hub 에 로그인돼 있어야 한다.

```
Unity.exe -batchmode -quit -buildTarget WebGL -projectPath unity-project -executeMethod BuildTools.BuildWebGL -logFile build.log
```

  끝나면 `unity-project/Build/WebGL/Build/*` 를 `public/unity/Build/` 로 복사하고 `src/ui.tsx` 의 `UNITY_V` 를 1 올린다
  (올리지 않으면 브라우저가 예전 파일을 계속 쓴다). `public/unity/index.html` 만 고쳐도 `UNITY_V` 를 올린다.
- 빌드 로그의 "missing script" 한 줄은 무시해도 된다. `BUILD RESULT: Succeeded` 만 확인한다.
- Unity 가 없는 팀원은 `ParkScene.cs` 를 건드리지 않는 범위에서 작업하고, 필요하면 Unity 가 있는 팀원에게 넘긴다.

## 함께 작업하는 법

- 작업 전 `git pull`. 작업은 브랜치에서 하고 `main` 에는 확인된 것만 합친다.
- 커밋은 팀원이 요청할 때만. 한 커밋에는 한 가지 일.
- `public/unity/Build/` 는 큰 바이너리라 두 사람이 동시에 다시 빌드하면 충돌한다. 빌드 전에 팀에 알린다.
- 배포(Vercel)는 저장소 주인 계정에서 한다. 다른 팀원은 푸시까지만 하고 배포를 요청한다.

## 겪었던 함정

- PowerShell 의 큰따옴표 문자열 안에서 `${...}` 가 사라진다. 코드 수정은 편집 도구로 한다.
- 공개 실시간 API 는 공원 전체 주차대수 하나만 준다. 주차장별 실제 잔여면 데이터는 없다.
- 실시간 값에는 장기 주차 차량이 섞여 있어 기준치 1060 을 빼고 쓴다 (`OLPARK_LIVE_BASELINE`).
- 입출차 기록(2024년 7월)에는 주차구역 구분이 없다. 시간대 패턴은 공원 전체 기준이다.
- 걷는 시간은 직선거리 × 1.3 ÷ 분당 75m 추정치다. 실제 경로가 아니라는 문구를 유지한다.
