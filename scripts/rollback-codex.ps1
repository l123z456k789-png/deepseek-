param(
  [string]$ConfigPath = "$env:USERPROFILE\.codex\config.toml",
  [string]$BackupDir = "C:\dev\vision-bridge-mcp\.audit\config-backups",
  [string]$Python = "python"
)
$ErrorActionPreference = 'Stop'
$bak = Get-ChildItem -LiteralPath $BackupDir -Filter 'config.toml.*.bak' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $bak) { Write-Error 'no config.toml backup found'; exit 1 }
Copy-Item -LiteralPath $bak.FullName -Destination $ConfigPath -Force
& $Python -c "import sys,tomllib; tomllib.load(open(sys.argv[1],'rb'))" $ConfigPath
if ($LASTEXITCODE -ne 0) { Write-Error 'TOML validation failed after rollback'; exit 1 }
Write-Output "ROLLED BACK to $($bak.Name)"