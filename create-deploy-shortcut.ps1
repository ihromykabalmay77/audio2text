$WshShell = New-Object -ComObject WScript.Shell
$Desktop = [System.Environment]::GetFolderPath("Desktop")

# Shortcut untuk deploy
$Shortcut = $WshShell.CreateShortcut("$Desktop\Deploy Audio2Text.lnk")
$Shortcut.TargetPath = "D:\Audio2Text\deploy.bat"
$Shortcut.WorkingDirectory = "D:\Audio2Text"
$Shortcut.Description = "Deploy Audio2Text to Vercel"
$Shortcut.IconLocation = "shell32.dll,175"
$Shortcut.Save()

Write-Host "Shortcut created: $Desktop\Deploy Audio2Text.lnk"