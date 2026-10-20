param(
  [string]$WorkspaceRoot = (Split-Path -Parent $PSScriptRoot),
  [switch]$PrepareOnly
)
$ErrorActionPreference = 'Stop'
$workspace = [System.IO.Path]::GetFullPath($WorkspaceRoot)
$sourceRoot = if (Test-Path -LiteralPath (Join-Path $workspace 'package.json')) { $workspace } else { Join-Path $workspace 'source' }
$program = Join-Path $sourceRoot 'release\0.4.1\win-unpacked\VideoManager.exe'
if (-not (Test-Path -LiteralPath $program)) { throw "New application not found: $program" }
$profile = Join-Path $workspace 'profiles\0.4.0'
$original = Join-Path $env:APPDATA 'VideoManager'
New-Item -ItemType Directory -Path $profile -Force | Out-Null
$marker = Join-Path $profile 'profile-origin.json'
if (-not (Test-Path -LiteralPath $marker)) {
  foreach ($name in @('videosorter.sqlite', 'ai-config.json', 'tmdb-config.json', 'player-config.json', 'mpv-config.json')) {
    $sourceFile = Join-Path $original $name
    $targetFile = Join-Path $profile $name
    if ((Test-Path -LiteralPath $sourceFile) -and -not (Test-Path -LiteralPath $targetFile)) {
      Copy-Item -LiteralPath $sourceFile -Destination $targetFile
    }
  }
  @{ source = $original; copiedAt = (Get-Date).ToString('o'); version = '0.4.1' } | ConvertTo-Json | Set-Content -LiteralPath $marker -Encoding UTF8
}
$env:VIDEOMANAGER_DATA_DIR = $profile
if ($PrepareOnly) {
  Write-Output "Prepared isolated profile: $profile"
  exit 0
}
Start-Process -FilePath $program -WorkingDirectory (Split-Path -Parent $program)
