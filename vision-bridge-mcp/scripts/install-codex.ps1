# Vision Bridge MCP - install into Codex (~/.codex/config.toml)
# Default: preview only. Use -Apply to write.
param(
  [switch]$Apply,
  [string]$ConfigPath = "$env:USERPROFILE\.codex\config.toml",
  [string]$BridgeEntry = "C:\dev\vision-bridge-mcp\dist\index.js",
  [string]$BackupDir = "C:\dev\vision-bridge-mcp\.audit\config-backups",
  [string]$Python = "python"
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ConfigPath)) { Write-Error "config.toml not found: $ConfigPath"; exit 1 }
$lines = Get-Content -Encoding UTF8 -LiteralPath $ConfigPath

$newSection = @"
[mcp_servers.zai-vision]
command = "node"
args = ["$($BridgeEntry.Replace('\','\\'))"]
env = { Z_AI_MODE = "ZHIPU", Z_AI_VISION_MODEL = "glm-4.6v-flash" }
env_vars = ["MIMO_API_KEY", "MIMO_API_KEY_2", "MIMO_API_KEY_3", "Z_AI_API_KEY"]
enabled = true
startup_timeout_sec = 120
tool_timeout_sec = 180
"@

# locate existing section
$start = -1; $end = $lines.Count
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -match '^\s*\[mcp_servers\.zai-vision\]\s*$') { $start = $i; break }
}
if ($start -ge 0) {
  for ($j = $start + 1; $j -lt $lines.Count; $j++) {
    if ($lines[$j] -match '^\s*\[') { $end = $j; break }
  }
  $oldSection = ($lines[$start..($end - 1)] -join "`n")
  $before = if ($start -gt 0) { $lines[0..($start - 1)] } else { @() }
  $after = if ($end -lt $lines.Count) { $lines[$end..($lines.Count - 1)] } else { @() }
} else {
  $oldSection = '<no existing zai-vision section>'
  $before = $lines
  $after = @()
}
Write-Output '--- PREVIEW: [mcp_servers.zai-vision] ---'
Write-Output ('OLD:')
Write-Output $oldSection
Write-Output 'NEW:'
Write-Output $newSection
if (-not $Apply) { Write-Output 'DRY-RUN: no changes written. Re-run with -Apply to commit.'; exit 0 }

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item -LiteralPath $ConfigPath -Destination (Join-Path $BackupDir "config.toml.$stamp.bak") -Force
$oldSection | Out-File -Encoding utf8 (Join-Path $BackupDir "zai-vision-original.$stamp.toml")
$newText = (($before -join "`n").TrimEnd("`r`n") + "`n" + $newSection + "`n" + (($after -join "`n").TrimStart("`r`n"))).Trim("`n") + "`n"
[System.IO.File]::WriteAllText($ConfigPath, $newText, (New-Object System.Text.UTF8Encoding($false)))
& $Python -c "import sys,tomllib; tomllib.load(open(sys.argv[1],'rb'))" $ConfigPath
if ($LASTEXITCODE -ne 0) { Write-Error 'TOML validation failed after write; restoring backup'; Copy-Item -LiteralPath (Join-Path $BackupDir "config.toml.$stamp.bak") -Destination $ConfigPath -Force; exit 1 }
Write-Output "APPLIED. Backup: $BackupDir\config.toml.$stamp.bak"