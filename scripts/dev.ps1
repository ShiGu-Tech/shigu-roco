# 一键开发：并行启动引擎(26901)与前端(26900)。
# 用法：pwsh scripts/dev.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root "logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

Write-Host "==> 启动引擎 127.0.0.1:26901（日志 logs/engine.log）" -ForegroundColor Cyan
Start-Process -FilePath "pwsh" -ArgumentList "-NoProfile", "-File", "$PSScriptRoot/engine-dev.ps1" `
  -WorkingDirectory $root -RedirectStandardOutput "$logDir/engine.log" -RedirectStandardError "$logDir/engine.err.log"

Write-Host "==> 启动前端 127.0.0.1:26900（日志 logs/web.log）" -ForegroundColor Cyan
Start-Process -FilePath "pwsh" -ArgumentList "-NoProfile", "-Command", "pnpm -F web dev" `
  -WorkingDirectory $root -RedirectStandardOutput "$logDir/web.log" -RedirectStandardError "$logDir/web.err.log"

Write-Host "已启动。打开 http://127.0.0.1:26900" -ForegroundColor Green
