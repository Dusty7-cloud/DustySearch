$ErrorActionPreference = 'Stop'

$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$installDir = Join-Path $env:LOCALAPPDATA 'DustySearchApp'
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'DustySearch.lnk'

New-Item -ItemType Directory -Force -Path $installDir | Out-Null

Get-CimInstance Win32_Process |
  Where-Object { $_.Name -match 'electron' -and $_.CommandLine -like "*$installDir*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

Start-Sleep -Milliseconds 500

$itemsToCopy = @('src', 'assets', 'node_modules', 'package.json', 'package-lock.json', 'README.md')
foreach ($item in $itemsToCopy) {
  $from = Join-Path $source $item
  $to = Join-Path $installDir $item
  if (Test-Path $to) {
    Remove-Item -LiteralPath $to -Recurse -Force
  }
  Copy-Item -LiteralPath $from -Destination $to -Recurse -Force
}

$cmdPath = Join-Path $installDir 'Start-DustySearch.cmd'
Set-Content -LiteralPath $cmdPath -Encoding ASCII -Value '@echo off
cd /d "%~dp0"
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
'

$uninstallPath = Join-Path $installDir 'Uninstall-DustySearch.ps1'
$uninstall = @'
$ErrorActionPreference = 'Stop'
$installDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'DustySearch.lnk'
if (Test-Path $desktopShortcut) {
  Remove-Item -LiteralPath $desktopShortcut -Force
}
Write-Host "DustySearch shortcut removed."
Write-Host "Program folder: $installDir"
Write-Host "Your data is kept in Documents\DustySearchData."
Write-Host "Close this window, then delete the program folder if you want to fully remove the app files."
'@
Set-Content -LiteralPath $uninstallPath -Encoding UTF8 -Value $uninstall

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($desktopShortcut)
$electronPath = Join-Path $installDir 'node_modules\electron\dist\electron.exe'
$shortcut.TargetPath = $electronPath
$shortcut.Arguments = '"' + $installDir + '"'
$shortcut.WorkingDirectory = $installDir
$shortcut.Description = 'Open DustySearch'
$shortcut.IconLocation = $electronPath + ',0'
$shortcut.WindowStyle = 1
$shortcut.Save()

Write-Host "DustySearch installed to: $installDir"
Write-Host "Desktop shortcut created: $desktopShortcut"
