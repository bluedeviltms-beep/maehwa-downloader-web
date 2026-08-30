# CHANGELOG - MaeHwa Downloader 🌸

본 문서에는 MaeHwa Downloader 서비스의 모든 주요 변경 사항, 기능 업데이트, 버그 수정 내역이 기록됩니다.

---

## 🚀 [v1.0.0] - 2026-08-30 (정식 라이브 릴리스)

### 🌐 배포 & 클라우드 도메인 (Deployment & Domain)
- **라이브 서비스 오픈**: 공식 커스텀 도메인 `https://downloader.maehwa.store/` 연결 및 Cloudflare Pages 프로덕션 배포 완료.
- **원클릭 자동 배포 파이프라인**: `npm run deploy` 명령어 한 줄로 정적 웹사이트 자동 빌드 (`npm run build:renderer`)부터 Cloudflare 배포까지 일괄 처리되도록 자동화 (`package.json`).
- **Next.js 14 정적 익스포트 연동**: `next.config.js` 정적 내보내기(`output: 'export'`) 및 clean export 복사 스크립트(`scripts/copy-out-to-public.js`) 구축.

### 🔍 UX & 헤더 네비게이션 (Header & Navigation)
- **상단 헤더 빠른 검색창 (Quick Header Search Bar)**:
  - 히어로 메인 페이지(`index.jsx`) 및 동영상 상세 페이지(`video/[id].jsx`) 상단 헤더에 검색어 및 유튜브 URL 입력창 통합.
  - 상세 페이지 탐색 중에도 상단 검색창에 키워드/링크 입력 후 `Enter` 입력 시 메인 검색 결과로 즉시 이동 및 자동 쿼리 (`?q=`) 감지 로드.
- **푸터 구성요소 정돈**: 푸터 하단 메뉴 링크 중 불필요한 `[검색 홈]` 항목 삭제.
- **미사용 UI 정리**: 메인 히어로 검색 헤더 영역의 미사용 "저장 폴더" 텍스트 블록 제거.

### ⚡ 클라이언트 수신 엔진 & 진행률 (Client Engine & Progress)
- **접속자 기기 자원 수신 엔진 (`clientDownload.js`)**:
  - 백엔드 과부하 및 서버 비용 없이 접속자 본인 기기(스마트폰, 태블릿, PC) 브라우저 메모리의 Blob 스트림으로 미디어 수신 및 다운로드 처리.
- **실시간 프로그레스 콘솔 (Progress Console & Bar)**:
  - 수신 데이터 용량 및 비율을 바탕으로 `0% ~ 100%` 실시간 진행 퍼센티지 뱃지 및 블루 그래디언트 게이지 애니메이션 제공.
- **오른쪽 상단 모던 토스트 알림 (Top-Right Toast Notification)**:
  - 기존 하단 인라인 배너를 제거하고 우측 상단 고정(`top: 24px, right: 24px`) 슬라이드 애니메이션 (`toastSlideIn`) 토스트 알림 적용.
  - 수동 닫기 버튼(`✕`) 및 4.5초 자동 소멸 타이머 지원.

### 🔊 오디오/비디오 코덱 & 미디어 픽스 (Media & Backend Fixes)
- **AAC 오디오 코덱 Muxing 보장**: MP4 동영상 다운로드 시 AAC 오디오 포맷 (`bestvideo[ext=mp4]+bestaudio[ext=m4a]`)을 강제하여 윈도우 미디어 플레이어 및 모바일 재생 시 소리 먹통 현상 완벽 방지.
- **파일명 UTF-8 인코딩 & 특수문자 정제**: 동영상 원래 제목의 OS 금지 특수문자 (`/ \ : * ? " < > |`) 자동 정제 및 UTF-8 파일명 보장.
- **YouTube 403 Forbidden 우회**: `yt-dlp` 최신 안정 버전으로 업데이트하여 유튜브 차단 에러 우회.

### 🎨 디자인 & 레이아웃 (Layout & UI)
- **페이지 셸 스크롤 픽스**: `global.css` 및 `.page-shell` 레이아웃 수정으로 푸터 잘림 현상 방지 및 유려한 세로 스크롤 구현.
- **커스텀 세렉트 드롭다운 (`CustomDropdown`)**: 기본 HTML `<select>` 요소를 대체하는 그림자/체크 표시 지원 커스텀 드롭다운 구현.
- **쓸모없는 잔재 파일 정리**: 불필요한 빌드/로그 폴더(`dist/`, `tmp-downloads/`, `logs/`, `electron-log.txt` 등) 프로젝트 깔끔 정리.

---

*Copyright © 2026 매화 Studio. 모든 권리 보유.*
