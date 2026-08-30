@echo off
setlocal
set YTDLP="%~dp0..\resources\bin\yt-dlp.exe"
set OUTDIR="%~dp0..\tmp-downloads"
if not exist %OUTDIR% mkdir %OUTDIR%
%YTDLP% -f bestaudio[ext=m4a]/bestaudio -o %OUTDIR%\\%%(title%%)s.%%(ext%%)s "%~1" --no-playlist --newline
endlocal
