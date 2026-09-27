# 初始化开发环境：安装前端依赖 + 引擎包（含 dev 依赖）。
# 用法：pwsh scripts/setup.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "==> 安装前端依赖（pnpm）" -ForegroundColor Cyan
Push-Location $root
pnpm install
Pop-Location

Write-Host "==> 安装引擎（pip editable + dev）" -ForegroundColor Cyan
python -m pip install -e "$root/engine[dev]" -i https://pypi.tuna.tsinghua.edu.cn/simple --timeout 120

Write-Host "完成。运行 pwsh scripts/dev.ps1 启动。" -ForegroundColor Green
