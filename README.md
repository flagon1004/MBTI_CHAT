# MBTI_CHAT-BOT

> MBTI 기반 심리 분석 웹앱 — Gemini AI 심층 분석 탑재

## 기술 스택
- Frontend: Vanilla HTML/CSS/JS (PWA 최적화)
- Backend: Vercel Edge Function
- AI: Google Gemini 1.5 Flash
- 배포: Vercel + GitHub Actions

## 프로젝트 구조
```
mbti-chatbot/
├── public/
│   └── index.html          # 프론트엔드 전체
├── api/
│   └── analyze.js          # Gemini API 서버리스 함수
├── .github/
│   └── workflows/
│       └── deploy.yml      # GitHub Actions CI/CD
├── vercel.json             # Vercel 설정
└── README.md
```

## GitHub Secrets 설정 (보안 핵심)

GitHub 레포지토리 → Settings → Secrets and variables → Actions 에서 아래 4가지 추가:

| Secret 이름 | 값 설명 |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio에서 발급한 API 키 |
| `VERCEL_TOKEN` | Vercel 계정 Settings → Tokens |
| `VERCEL_ORG_ID` | Vercel 프로젝트 Settings → General |
| `VERCEL_PROJECT_ID` | Vercel 프로젝트 Settings → General |

## 배포 순서

1. GitHub에 이 레포지토리 push
2. Vercel에서 프로젝트 연결 (Import from GitHub)
3. Vercel 환경변수에 `GEMINI_API_KEY` 추가
4. GitHub Secrets 4개 설정
5. main 브랜치 push → 자동 배포

## API 보안 구조

```
브라우저 → /api/analyze (Vercel Edge) → Gemini API
                ↑
         GEMINI_API_KEY는 Vercel 서버 환경변수에만 존재
         브라우저/GitHub에 절대 노출 안 됨
```

## 로컬 개발

```bash
npm i -g vercel
vercel dev   # localhost:3000
# .env.local 파일에 GEMINI_API_KEY=your_key_here 추가
```
