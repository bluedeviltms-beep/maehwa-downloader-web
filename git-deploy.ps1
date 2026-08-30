$git = 'C:\Program Files (x86)\Microsoft Visual Studio\2019\Community\Common7\IDE\CommonExtensions\Microsoft\TeamFoundation\Team Explorer\Git\cmd\git.exe'

cmdkey /delete:LegacyGeneric:target=git:https://github.com 2>$null
cmdkey /delete:git:https://github.com 2>$null

& $git config user.email "bluedeviltms@gmail.com"
& $git config user.name "bluedeviltms-beep"

if (!(Test-Path '.git')) {
    & $git init
    & $git remote add origin https://github.com/bluedeviltms-beep/maehwa-downloader-web.git
}

& $git branch -M main
& $git add .
& $git commit -m "Deploy Render backend configuration"
& $git push -u origin main --force
