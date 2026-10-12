# package.ps1 - Build a clean Chrome Web Store upload zip.
$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$out = Join-Path $root 'skip-cam-login.zip'

# Runtime files stay flat at the repo root (Compress-Archive is given file paths).
$include = @(
    'manifest.json',
    'icon.png',
    'icon-16.png',
    'icon-24.png',
    'icon-32.png',
    'icon-48.png',
    'icon-128.png',
    'shared.js',
    'content.js',
    'background.js',
    'settings.html',
    'settings.js',
    'popup.css',
    'welcome.html',
    'welcome.js',
    'welcome.css'
)

$missing = $include | Where-Object { -not (Test-Path (Join-Path $root $_)) }
if ($missing) {
    throw "Missing required files: $($missing -join ', ')"
}

# Every file the extension references must be in the include list.
$manifest = Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json
$referenced = New-Object System.Collections.Generic.List[string]
foreach ($p in $manifest.icons.PSObject.Properties) { $referenced.Add($p.Value) }
if ($manifest.action.default_icon) {
    foreach ($p in $manifest.action.default_icon.PSObject.Properties) { $referenced.Add($p.Value) }
}
if ($manifest.action.default_popup) { $referenced.Add($manifest.action.default_popup) }
$referenced.Add($manifest.background.service_worker)
foreach ($cs in $manifest.content_scripts) {
    foreach ($f in @($cs.js) + @($cs.css)) { if ($f) { $referenced.Add($f) } }
}

foreach ($html in $include | Where-Object { $_ -like '*.html' }) {
    $text = Get-Content (Join-Path $root $html) -Raw
    foreach ($m in [regex]::Matches($text, '(?:src|href)="([^"#?]+)')) {
        $ref = $m.Groups[1].Value
        if ($ref -notmatch '^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|//)') { $referenced.Add($ref) }
    }
}

$worker = Get-Content (Join-Path $root $manifest.background.service_worker) -Raw
foreach ($m in [regex]::Matches($worker, "importScripts\(([^)]*)\)")) {
    foreach ($q in [regex]::Matches($m.Groups[1].Value, "['""]([^'""]+)['""]")) { $referenced.Add($q.Groups[1].Value) }
}
foreach ($m in [regex]::Matches($worker, "iconUrl:\s*'([^']+)'")) { $referenced.Add($m.Groups[1].Value) }

$notPackaged = $referenced | Sort-Object -Unique | Where-Object { $include -notcontains $_ }
if ($notPackaged) {
    throw "Referenced but not in the include list: $($notPackaged -join ', ')"
}

if (Test-Path $out) { Remove-Item $out -Force }

$paths = $include | ForEach-Object { Join-Path $root $_ }
Compress-Archive -Path $paths -DestinationPath $out -Force

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($out)
try {
    $entries = @($zip.Entries | ForEach-Object { $_.FullName })
} finally {
    $zip.Dispose()
}
$extra = $entries | Where-Object { $include -notcontains $_ }
$absent = $include | Where-Object { $entries -notcontains $_ }
if ($extra -or $absent) {
    throw "Zip contents differ from the include list. Extra: $($extra -join ', '). Missing: $($absent -join ', ')."
}

$zipKB = [math]::Round((Get-Item $out).Length / 1KB, 1)
Write-Host "Created: $out ($zipKB KB)"
Write-Host "Zip entries ($($entries.Count)):"
foreach ($e in $entries) { Write-Host "  - $e" }
