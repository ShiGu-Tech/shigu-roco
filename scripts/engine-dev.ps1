# 启动 Python 引擎（FastAPI / uvicorn，监听 127.0.0.1:26901）。
# 用法：pwsh scripts/engine-dev.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location "$root/engine"
python -m uvicorn roco_engine.api.app:app --host 127.0.0.1 --port 26901 --reload
Pop-Location
