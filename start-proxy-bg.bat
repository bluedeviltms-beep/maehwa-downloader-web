@echo off
:: MaeHwa Downloader - 백그라운드 프록시 서버 자동 실행
:: 이미 실행 중이면 중복 실행 안 함
tasklist /FI "IMAGENAME eq node.exe" /FI "WINDOWTITLE eq maehwa-proxy" 2>NUL | find /I "node.exe" >NUL
if not errorlevel 1 (
    exit /b 0
)

cd /d "c:\Users\UserK\Desktop\maehwa-downloader-web"
start "maehwa-proxy" /MIN node proxy/server.js
