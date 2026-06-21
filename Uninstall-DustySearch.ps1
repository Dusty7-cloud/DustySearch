$ErrorActionPreference = 'Stop'

$installDir = Join-Path $env:LOCALAPPDATA 'DustySearchApp'
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'DustySearch.lnk'

if (Test-Path $desktopShortcut) {
  Remove-Item -LiteralPath $desktopShortcut -Force
}

if (Test-Path $installDir) {
  Write-Host "Program folder: $installDir"
  Write-Host "For safety, this script does not delete a running app folder automatically."
  Write-Host "Close DustySearch, then delete this folder if you want to remove app files."
}

Write-Host "Your data is kept in Documents\DustySearchData."
