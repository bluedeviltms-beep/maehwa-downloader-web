릴리스 업로드 체크리스트 (수동 업로드용)

목표: GitHub Release에 수동 업로드할 파일과 순서, 검증 항목을 정리합니다.

대상 버전: v0.1.2

1) 업로드할 파일(권장)
- dist/v0.1.2/MaeHwa Downloader-Setup-0.1.2.exe
- dist/v0.1.2/MaeHwa Downloader-Setup-0.1.2.exe.blockmap
- dist/v0.1.2/latest.yml

2) 루트/보조 파일(업로드 권장)
- dist/latest.yml            # 전역 latest.yml (자동업데이트가 참조)
- dist/maehwa-downloader-app-0.1.2-x64.nsis.7z   # optional
- dist/*blockmap (있다면 모두)

3) 업로드 순서
- GitHub → Releases → Draft a new release
  - Tag version: v0.1.2  (package.json `version`과 정확히 일치)
  - Release title: v0.1.2
  - Release notes: 변경사항 간단 요약
- Assets 섹션에 위 파일들을 업로드 (특히 `dist/v0.1.2/MaeHwa Downloader-Setup-0.1.2.exe` 와 `dist/v0.1.2/MaeHwa Downloader-Setup-0.1.2.exe.blockmap`, `dist/latest.yml`을 반드시 포함)
- Publish release

4) 검증 (업로드 후)
- `latest.yml`의 `version:` 값이 `0.1.2`인지 확인
  - 예: `dist/v0.1.2/latest.yml` 또는 `dist/latest.yml` 열어 `version:` 항목 확인
- 업로드된 Assets의 파일 크기와 로컬 파일의 크기(또는 sha512)가 일치하는지 간단 비교
- 설치된 앱에서 `업데이트 확인`을 눌러 새 릴리스가 감지되는지 테스트 (패키지된 앱에서만 동작)

5) 자주 하는 실수
- `latest.yml` 누락 — electron-updater가 새 버전을 찾지 못함
- 릴리스 태그(`v0.1.2`)와 `package.json` `version` 불일치
- blockmap 또는 .exe 누락
- 릴리스 비공개(private)로 올려 접근 문제가 발생함

6) 빠른 로컬 확인 명령 (Windows CMD)
- dist 파일 목록 보기:
  dir /b dist\v0.1.2

- latest.yml 내용 확인:
  type dist\\v0.1.2\\latest.yml

7) 필요하면 제가 도와드릴 수 있는 것
- 업로드할 정확한 파일 목록 생성(현재 dist 탐색 기반)
- `latest.yml` 내용과 업로드 후의 URL 매핑 검증
- 릴리스 업로드 직후 자동 검증 리포트 생성

파일 위치 참고:
- 프로젝트 루트: `RELEASE_UPLOAD.md`
- 빌드 산출물: `dist/` 및 `dist/v0.1.2/`

안내 끝. 작업하실 준비되면 "업로드 완료"라고 알려주세요 — 업로드 후 검증을 도와드리겠습니다.
