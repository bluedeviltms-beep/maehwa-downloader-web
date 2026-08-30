# MaeHwa Downloader 🌸

매화 스튜디오(MaeHwa Studio)의 고성능 YouTube 다운로드 웹 서비스 및 데스크톱 앱입니다.

🌐 **공식 라이브 웹사이트**: [https://downloader.maehwa.store/](https://downloader.maehwa.store/)

---

## 🔒 확정된 다운로드 아키텍처 원칙 (Immutable Architecture)

> **⚠️ 주의: 아래 다운로드 아키텍처 구조는 100% 검증된 정석 파이프라인이므로 외부 서비스 혼용 금지.**

1. **클라이언트 (Frontend Engine - `clientDownload.js`)**:
   - 접속자 브라우저(스마트폰, 태블릿, PC) 단에서 `downloadClientSideDirect`를 통해 파일 수신 및 실시간 프로그레스 바 UI (`0% ~ 100%`) 처리.
   - 브라우저 인라인 스트림 수신으로 외부 팝업이나 새 탭 이탈 없이 본인 웹사이트 내부에서 수신.

2. **백엔드 (Media Pipeline - `proxy/server.js`)**:
   - `yt-dlp` + `FFmpeg` 파이프라인으로 YouTube 403 Forbidden 우회 및 고화질 MP4 / AAC 오디오 코덱 Muxing 담당.
   - 봇 방지 리다이렉트가 발생하는 외부 3rd party 퍼블릭 API를 절대 사용하지 않고 자체 검증 엔진만 사용.

---

## 🚀 빠른 재배포 방법 (One-Click Deployment)

코드 수정 후 웹사이트를 즉시 업데이트 배포하려면 터미널에서 다음 명령어 한 줄만 실행하세요:

```bash
npm run deploy
```

> **내부 동작**:
> 1. 최신 소스코드로 정적 웹사이트 자동 빌드 (`npm run build:renderer`)
> 2. Cloudflare Pages에 자동 재배포 (`https://downloader.maehwa.store/` 즉시 반영)

---

## 💻 로컬 개발 및 프록시 실행

```bash
# 개발 서버 구동 (포트 3000)
npm run dev

# 프록시 서버 구동 (포트 3001 - 백엔드 미디어 파이프라인)
npm run start-proxy
```

---

## 🛠️ 주요 특징 & 기술 스택

- **프론트엔드**: Next.js (React), Cloudflare Pages 엣지 서빙
- **다운로드 엔진**: 접속자 기기 브라우저 수신 + 백엔드 `yt-dlp` + `FFmpeg` 스트리밍
- **미디어 지원**: MP4 고화질 비디오 / M4A (AAC) 오디오 다운로드 (소리 먹통 방지 적용)
- **UX/UI**: 모던 네비게이션, 상단 통합 검색 바, 고화질 썸네일, 실시간 프로그레스 바, 우측 상단 토스트 알림

---

*Copyright © 2026 매화 Studio. 모든 권리 보유.*
