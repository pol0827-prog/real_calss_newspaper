# 3학년 1반 우리들 신문

Firebase(로그인·저장) + GitHub + Vercel(배포) + Google AI Studio(글 도우미) 버전.

## 파일
| 파일 | 하는 일 |
|---|---|
| `index.html` | 화면 디자인(CSS)과 시작 코드 |
| `app.js` | 신문 편집실 앱 (원래 Claude 신문을 Firebase용으로 고친 것) |
| `fb.js` | Firebase 연결: 구글 로그인, Firestore 저장, 사진 저장 |
| `config.js` | Firebase 설정값, 관리자 최대 2명 / 계정 최대 12개 |
| `api/ai.js` | Vercel 서버 함수: Google AI Studio(Gemini) 호출. 편집위원 로그인한 사람만 사용 |
| `firestore.rules` | Firestore 보안 규칙 (콘솔 → Firestore → 규칙에 붙여넣기) |
| `src/orig.js` | 고치기 전 원본 앱 코드 (참고용, 배포에 필요 없음) |

## 지금까지 된 것
- 처음 '편집위원 로그인' 하는 구글 계정이 **편집장(관리자)** 으로 등록
- 관리자 화면에만 **더보기 → 계정 등록·수정** (관리자 최대 2명, 편집위원 추가·수정·삭제)
- 등록된 계정은 구글 로그인 후 함께 편집, 저장은 Firestore
- 처음엔 빈 신문으로 열림, 예시는 '더보기 → 예시 신문 불러오기'로만
- **이 면 복사** 버튼 (면 추가 옆): 지금 면을 복사해 뒤에 새 면으로
- **신문 화면 미리보기** 버튼 + 미리보기 중 '편집으로 돌아가기'
- 편집 화면 상단 **로그아웃** 버튼
- 학생 '나도 기사 쓰기'는 로그인 없이 Firestore로 전송
- AI 글 도우미는 `/api/ai` 로 호출, API 키는 Vercel 환경변수에만

## 아직 안 된 것 (이어서 할 일)
1. **면 구도(디자인) 1~5번** — 배치가 서로 다른 면 레이아웃을 골라 넣는 기능 (요청됨, 미착수)
2. 관리자용 '계정 등록·수정'을 더보기 메뉴가 아닌 상단 탭으로도 노출 (선택)
3. 실제 브라우저 동작 점검 (코드 문법 검사만 통과한 상태)
4. GitHub 저장소(`class-newspaper`) 만들고 올리기 → Vercel 연결

## 배포 순서
1. **Firebase 콘솔** (프로젝트 `real-calss-newspaper`)
   - Authentication → 로그인 방법 → **Google 사용 설정**
   - Firestore Database 만들기 (위치 `asia-northeast3` 서울 권장)
   - Firestore → 규칙 → `firestore.rules` 내용 붙여넣고 **게시**
2. **GitHub**: 새 저장소 `class-newspaper` 만들고 이 폴더 파일을 모두 올리기 (`src/` 는 빼도 됨)
3. **Vercel**: Add New → Project → GitHub 저장소 선택 → Framework Preset **Other** → Deploy
   - Settings → Environment Variables:
     - `GEMINI_API_KEY` = Google AI Studio에서 만든 API 키
     - (선택) `GEMINI_MODEL` = 기본값 `gemini-3.6-flash`
   - 환경변수 넣은 뒤 **Redeploy**
4. **Firebase 콘솔** → Authentication → 설정 → **승인된 도메인**에 Vercel 주소(예: `class-newspaper.vercel.app`) 추가
5. 배포 직후 **선생님이 가장 먼저** 사이트에서 '편집위원 로그인' → 편집장 등록 (먼저 로그인한 사람이 편집장이 되므로)

## 주의
- `config.js` 의 Firebase 웹 설정값은 공개돼도 되는 값입니다. **Gemini API 키는 절대 코드에 넣지 말고** Vercel 환경변수에만 넣으세요.
- 사진은 자동으로 줄여서 Firestore `images` 컬렉션에 따로 저장합니다(문서 1MB 제한 때문).
- 여러 명이 동시에 같은 면을 편집하면 마지막에 저장한 내용이 남습니다.
