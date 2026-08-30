$git = 'C:\Program Files (x86)\Microsoft Visual Studio\2019\Community\Common7\IDE\CommonExtensions\Microsoft\TeamFoundation\Team Explorer\Git\cmd\git.exe'

& $git config user.email "bluedeviltms@gmail.com"
& $git config user.name "bluedeviltms-beep"

if (!(Test-Path '.git')) {
    & $git init
}

& $git remote set-url origin https://bluedeviltms-beep@github.com/bluedeviltms-beep/maehwa-downloader-web.git 2>$null
if ($LASTEXITCODE -ne 0) {
    & $git remote add origin https://bluedeviltms-beep@github.com/bluedeviltms-beep/maehwa-downloader-web.git
}

& $git branch -M main
& $git add .
& $git commit -m "Deploy Render backend configuration" 2>$null
& $git push -u origin main --force
