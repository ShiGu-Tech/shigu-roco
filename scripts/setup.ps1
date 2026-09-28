# 初始化开发环境：安装前端依赖（引擎已并入前端同仓，无需 Python 环境）。
# 用法：pwsh scripts/setup.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "==> 安装依赖（pnpm）" -ForegroundColor Cyan
Push-Location $root
pnpm install
Pop-Location

Write-Host "完成。运行 pwsh scripts/dev.ps1（或 pnpm dev）启动，打开 http://127.0.0.1:26900" -ForegroundColor Green
