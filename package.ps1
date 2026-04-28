# package.ps1 - Build a clean Chrome Web Store upload zip.
$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$out = Join-Path $root 'skip-cam-login.zip'

$include = @(
    'manifest.json',
    'icon.png',
    'content.js',
    'background.js',
    'settings.html',
    'settings.js'
)

$missing = $include | Where-Object { -not (Test-Path (Join-Path $root $_)) }
if ($missing) {
    throw "Missing required files: $($missing -join ', ')"
}

if (Test-Path $out) { Remove-Item $out -Force }

$paths = $include | ForEach-Object { Join-Path $root $_ }
Compress-Archive -Path $paths -DestinationPath $out -Force

$zipKB = [math]::Round((Get-Item $out).Length / 1KB, 1)
Write-Host "Created: $out ($zipKB KB)"
Write-Host "Contents:"
foreach ($f in $include) { Write-Host "  - $f" }
