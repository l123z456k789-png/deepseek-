param(
  [string]$ClaudeJsonPath = "$env:USERPROFILE\.claude.json",
  [string]$CodexConfigPath = "$env:USERPROFILE\.codex\config.toml",
  [string]$BridgeEntry = "C:\dev\vision-bridge-mcp\dist\index.js"
)
$ErrorActionPreference = 'Stop'
$allOk = $true
function Check($name, $ok, $detail) { Write-Output ("{0}={1} {2}" -f $name, $(if ($ok) { 'PASS' } else { 'FAIL' }), $detail); if (-not $ok) { $script:allOk = $false } }

Check 'BRIDGE_ENTRY_EXISTS' (Test-Path -LiteralPath $BridgeEntry) $BridgeEntry

if (Test-Path -LiteralPath $ClaudeJsonPath) {
  $j = Get-Content -Raw -Encoding UTF8 -LiteralPath $ClaudeJsonPath | ConvertFrom-Json
  $s = $j.mcpServers.'zai-vision'
  Check 'CLAUDE_POINTS_TO_BRIDGE' ($s -and $s.command -eq 'node' -and $s.args -contains $BridgeEntry) 'zai-vision command/args'
} else { Check 'CLAUDE_POINTS_TO_BRIDGE' $false 'claude.json missing' }

if (Test-Path -LiteralPath $CodexConfigPath) {
  $c = Get-Content -Raw -Encoding UTF8 -LiteralPath $CodexConfigPath
  $secOk = $c -match '\[mcp_servers\.zai-vision\]' -and $c.Contains($BridgeEntry.Replace('\','\\')) -and $c -match 'env_vars = \["MIMO_API_KEY", "MIMO_API_KEY_2", "MIMO_API_KEY_3", "Z_AI_API_KEY"\]'
  Check 'CODEX_POINTS_TO_BRIDGE' $secOk 'config.toml zai-vision section'
} else { Check 'CODEX_POINTS_TO_BRIDGE' $false 'config.toml missing' }

$mimo = [Environment]::GetEnvironmentVariable('MIMO_API_KEY', 'Process')
$zhipu = [Environment]::GetEnvironmentVariable('Z_AI_API_KEY', 'Process')
Check 'MIMO_KEY_PRESENT' ([bool]$mimo) 'MIMO_API_KEY in process env'
$mimo2 = [Environment]::GetEnvironmentVariable('MIMO_API_KEY_2', 'Process')
Check 'MIMO_KEY2_PRESENT' ([bool]$mimo2) 'MIMO_API_KEY_2 in process env'
$mimo3 = [Environment]::GetEnvironmentVariable('MIMO_API_KEY_3', 'Process')
Check 'MIMO_KEY3_PRESENT' ([bool]$mimo3) 'MIMO_API_KEY_3 in process env'
Check 'ZHIPU_KEY_PRESENT' ([bool]$zhipu) 'Z_AI_API_KEY in process env'

Write-Output ("VERIFY_RESULT=" + $(if ($allOk) { 'PASS' } else { 'FAIL' }))
exit $(if ($allOk) { 0 } else { 1 })