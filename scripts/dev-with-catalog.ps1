param(
  [Parameter(Mandatory = $true)]
  [string]$CatalogDataDir,
  [int]$Port = 26900
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $CatalogDataDir)) {
  throw "图鉴注册快照目录不存在: $CatalogDataDir。快照必须由 https://roco.world/zh/ 同步适配器生成。"
}
if (-not (Test-Path -LiteralPath (Join-Path $CatalogDataDir "meta.json"))) {
  throw "图鉴数据目录缺少 meta.json: $CatalogDataDir"
}

$env:PORT = "$Port"

Write-Host "启动 shigu-roco（运行时只认现查图鉴，无静态兜底）..."
$server = Start-Process -FilePath "pnpm.cmd" -ArgumentList "-F", "web", "exec", "next", "dev", "-p", "$Port" -WorkingDirectory (Split-Path -Parent $PSScriptRoot) -PassThru
try {
  $registerUri = "http://localhost:$Port/api/engine/admin/catalog/register"
  $healthUri = "http://localhost:$Port/api/engine/health"
  $payload = @{ sourceDir = $CatalogDataDir; activate = $true } | ConvertTo-Json

  $registered = $null
  for ($i = 0; $i -lt 120; $i++) {
    try {
      $registered = Invoke-RestMethod -Method Post -Uri $registerUri -ContentType "application/json" -Body $payload -TimeoutSec 60
      break
    } catch {
      Start-Sleep -Milliseconds 1000
    }
  }
  if (-not $registered) { throw "图鉴注册失败：开发服务未在端口 $Port 就绪" }

  $health = Invoke-RestMethod -Uri $healthUri -TimeoutSec 5
  Write-Host "图鉴注册完成: $($registered.registrationId)"
  Write-Host "动态资源: 精灵 $($health.counts.sprites) / 技能 $($health.counts.skills)"
  Write-Host "访问地址: http://localhost:$Port/"
  Write-Host "按 Ctrl+C 停止服务。"
  Wait-Process -Id $server.Id
} finally {
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
}
