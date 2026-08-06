# Vision Bridge MCP - install into Claude Code (~/.claude.json)
# Default: preview only. Use -Apply to write.
param(
  [switch]$Apply,
  [string]$ClaudeJsonPath = "$env:USERPROFILE\.claude.json",
  [string]$BridgeCommand = "node",
  [string]$BridgeEntry = "C:\dev\vision-bridge-mcp\dist\index.js",
  [string]$BackupDir = "C:\dev\vision-bridge-mcp\.audit\config-backups"
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ClaudeJsonPath)) { Write-Error "claude.json not found: $ClaudeJsonPath"; exit 1 }
$json = Get-Content -Raw -Encoding UTF8 -LiteralPath $ClaudeJsonPath | ConvertFrom-Json
$server = $json.mcpServers.'zai-vision'
if (-not $server) { Write-Error 'mcpServers.zai-vision not found'; exit 1 }

$old = [ordered]@{ type = $server.type; command = $server.command; args = $server.args; env = $server.env }
$new = [ordered]@{
  type = 'stdio'
  command = $BridgeCommand
  args = @($BridgeEntry)
  env = [ordered]@{ Z_AI_MODE = 'ZHIPU'; Z_AI_VISION_MODEL = 'glm-4.6v-flash' }
}

Write-Output '--- PREVIEW: zai-vision MCP ---'
Write-Output ('OLD: ' + ($old | ConvertTo-Json -Compress -Depth 5))
Write-Output ('NEW: ' + ($new | ConvertTo-Json -Compress -Depth 5))
Write-Output ('TARGET: ' + $ClaudeJsonPath)
if (-not $Apply) { Write-Output 'DRY-RUN: no changes written. Re-run with -Apply to commit.'; exit 0 }

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item -LiteralPath $ClaudeJsonPath -Destination (Join-Path $BackupDir "claude.json.$stamp.bak") -Force
($old | ConvertTo-Json -Depth 5) | Out-File -Encoding utf8 (Join-Path $BackupDir "zai-vision-original.$stamp.json")
$json.mcpServers.'zai-vision' = $new
$json | ConvertTo-Json -Depth 12 | ForEach-Object { [System.IO.File]::WriteAllText($ClaudeJsonPath, $_, (New-Object System.Text.UTF8Encoding($false))) }
$check = Get-Content -Raw -Encoding UTF8 -LiteralPath $ClaudeJsonPath | ConvertFrom-Json
if (-not $check.mcpServers.'zai-vision' -or $check.mcpServers.'zai-vision'.command -ne $BridgeCommand) { Write-Error 'post-write validation failed'; exit 1 }
Write-Output "APPLIED. Backup: $BackupDir\claude.json.$stamp.bak"