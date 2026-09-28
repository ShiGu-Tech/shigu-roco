# 一键开发：启动前端（Next.js，127.0.0.1:26900）。
# 引擎已并入前端同仓（纯 TS，MCTS 在 Web Worker 内跑），无需独立进程。
# 用法：pwsh scripts/dev.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "==> 启动前端 127.0.0.1:26900（引擎内置）" -ForegroundColor Cyan
Push-Location $root
pnpm -F web dev
Pop-Location
