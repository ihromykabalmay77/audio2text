$WshShell = New-Object -ComObject WScript.Shell
$Desktop = [System.Environment]::GetFolderPath("Desktop")
$Shortcut = $WshShell.CreateShortcut("$Desktop\Speech to Narasi.lnk")
$Shortcut.TargetPath = "D:\Audio2Text\start-local.bat"
$Shortcut.WorkingDirectory = "D:\Audio2Text"
$Shortcut.Description = "Speech to Narasi - Local Server"
$Shortcut.IconLocation = "shell32.dll,175"
$Shortcut.Save()
Write-Host "Shortcut created at: $Desktop\Speech to Narasi.lnk"