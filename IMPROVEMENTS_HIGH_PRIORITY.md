요약: main.js에 적용한 고우선순위 수정

적용 변경사항:
- 입력 검증
  - `youtube:search`: 빈 쿼리 차단, 쿼리 길이 제한(300), `maxResults` 상한 50 적용
  - `download:start`: URL 타입 및 YouTube 도메인 검증, `kind`/`quality`/`format` 화이트리스트 검증, `outputDir` 타입 체크

- 파일명 정규화
  - `sanitizeFilename()` 헬퍼 추가: 제어문자 제거, 불법문자 치환, 윈도우 예약어 회피, 길이 제한
  - 모든 제목/파일명 생성 지점에서 `sanitizeFilename` 사용

- 임시파일 정리 개선
  - `tempBase` 토큰 도입: 부분 다운로드 중 생성된 파일(`maehwa_tmp_*`)을 식별해 cleanup 시 일괄 삭제
  - 기존 `cleanupPartial()`을 강화해 tempBase 매칭 파일과 0바이트 플레이스홀더를 삭제

안전성·운영상 참고사항:
- `isValidYouTubeUrl()`는 간단한 호스트 기반 검증을 수행합니다. 외부 URL 허용 정책을 바꾸려면 이 함수를 확장하세요.
- 사용자 제공 `outputDir`에 대해 더 엄격한 경로 검증(예: 앱에 의해 쓰기 가능한 경로인지 체크)을 권장합니다.

다음 권장 작업(우선순위)
1) (높음) IPC 요청 빈도 제한 및 재시도 정책 정교화 — API rate limit 방지
2) (높음) `proxy/server.js`에 인증/Origin 검사 추가 — API 키 노출 위험 저감
3) (중간) `main.js`를 모듈화하여 `ipc/`, `services/`로 분리
4) (중간) 로그 포맷 표준화 및 로그 로테이션
5) (낮음) TypeScript 마이그레이션 및 IPC 스키마 타입 정의

변경된 파일:
- `main.js` (입력 검증, sanitizeFilename, cleanup 개선)

원하시면 지금 변경사항을 더 확장하여:
- IPC 스키마 검증 라이브러리(Zod) 도입 및 적용
- `proxy/server.js` 보안 업데이트(토큰/Origin)
- `main.js` 모듈화용 패치(분리 작업)

다음으로 무엇을 진행할까요? (옵션: A) IPC 스키마 도입, B) proxy 보안 강화, C) main.js 리팩터)
