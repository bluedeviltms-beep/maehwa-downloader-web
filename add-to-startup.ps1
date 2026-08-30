$WshShell = New-Object -ComObject WScript.Shell
$startupFolder = [System.IO.Path]::Combine($env:APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
$dest = [System.IO.Path]::Combine($startupFolder, "maehwa-proxy.lnk")
$Shortcut = $WshShell.CreateShortcut($dest)
$Shortcut.TargetPath = "c:\Users\UserK\Desktop\maehwa-downloader-web\maehwa-proxy-silent.vbs"
$Shortcut.WorkingDirectory = "c:\Users\UserK\Desktop\maehwa-downloader-web"
$Shortcut.Description = "MaeHwa Downloader Proxy"
$Shortcut.Save()
Write-Host "Startup shortcut created at $dest"
