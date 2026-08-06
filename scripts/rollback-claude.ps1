param(
  [string]$ClaudeJsonPath = "$env:USERPROFILE\.claude.json",
  [string]$BackupDir = "C:\dev\vision-bridge-mcp\.audit\config-backups"
)
$ErrorActionPreference = 'Stop'
$bak = Get-ChildItem -LiteralPath $BackupDir -Filter 'claude.json.*.bak' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $bak) { Write-Error 'no claude.json backup found'; exit 1 }
Copy-Item -LiteralPath $bak.FullName -Destination $ClaudeJsonPath -Force
$check = Get-Content -Raw -Encoding UTF8 -LiteralPath $ClaudeJsonPath | ConvertFrom-Json
if (-not $check.mcpServers.'zai-vision') { Write-Error 'rollback validation failed'; exit 1 }
Write-Output "ROLLED BACK to $($bak.Name)"