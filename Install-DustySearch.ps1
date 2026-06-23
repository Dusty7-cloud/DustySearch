$ErrorActionPreference = 'Stop'

$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$installDir = Join-Path $env:LOCALAPPDATA 'DustySearchApp'
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'DustySearch.lnk'
$desktopNote = Join-Path ([Environment]::GetFolderPath('Desktop')) 'DustySearch 安装说明.txt'
$selfCheckResult = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'DustySearchData\self-check-result.json'

New-Item -ItemType Directory -Force -Path $installDir | Out-Null

try {
  Get-CimInstance Win32_Process |
    Where-Object { $_.Name -match 'electron' -and $_.CommandLine -like "*$installDir*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
} catch {
  Write-Host "没有拿到关闭旧版窗口的权限；如果 DustySearch 正在打开，请手动关闭后再运行安装脚本。"
}

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

$selfCheckCmdPath = Join-Path $installDir 'Run-Self-Check.cmd'
Set-Content -LiteralPath $selfCheckCmdPath -Encoding ASCII -Value '@echo off
cd /d "%~dp0"
"%~dp0node_modules\electron\dist\electron.exe" "%~dp0" --self-check
echo.
echo Self-check result:
type "%USERPROFILE%\Documents\DustySearchData\self-check-result.json"
echo.
pause
'

$readmePath = Join-Path $installDir 'README-Open-Me.txt'
$readme = @"
DustySearch 安装完成

打开软件：
1. 双击桌面上的 DustySearch。
2. 如果桌面快捷方式不见了，运行这里的 Start-DustySearch.cmd。

检查软件是否正常：
1. 运行这里的 Run-Self-Check.cmd。
2. 看到 ok: true，说明基础功能正常。

常用位置：
- 软件位置：$installDir
- 数据位置：$([Environment]::GetFolderPath('MyDocuments'))\DustySearchData
- 自检报告：$selfCheckResult

卸载提醒：
运行 Uninstall-DustySearch.ps1 只会移除快捷方式，不会删除你的记忆库数据。
"@
Set-Content -LiteralPath $readmePath -Encoding UTF8 -Value $readme
Set-Content -LiteralPath $desktopNote -Encoding UTF8 -Value $readme

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
Write-Host "Desktop install note created: $desktopNote"
Write-Host "Self-check tool created: $selfCheckCmdPath"
Write-Host "Install note created: $readmePath"
