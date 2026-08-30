# MaeHwa Downloader 배포 및 아키텍처 안내서

🌐 **공식 라이브 웹사이트**: [https://downloader.maehwa.store/](https://downloader.maehwa.store/)

---

## 🔒 확정된 다운로드 파이프라인 구조 (Do Not Change)

1. **프론트엔드 수신 (`renderer/utils/clientDownload.js`)**:
   - 접속한 유저 기기(휴대폰, 태블릿, 컴퓨터) 브라우저에서 인라인 스트림 수신.
   - 외부 리다이렉션 사이트/새 탭 열림 금지.

2. **백엔드 병합 (`proxy/server.js`)**:
   - `yt-dlp` 최신 안정 버전으로 YouTube 403 bypass.
   - `FFmpeg`로 비디오와 AAC 오디오 코덱 Muxing (음소거/소리 먹통 문제 방지).

---

## ⚡ 원클릭 배포 (Recommended)

소스 수정 후 라이브 웹사이트(`downloader.maehwa.store`)로 배포하려면 터미널에서 다음 명령어 한 줄만 실행하시면 됩니다:

```bash
npm run deploy
```

이 명령어 하나로 **자동 빌드 + Cloudflare Pages 즉시 재배포**가 일괄 처리됩니다.

---

*Copyright © 2026 매화 Studio. 모든 권리 보유.*
