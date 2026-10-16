# 构建 shigu-rock 镜像 + 同步 data/ + 分发部署到 cspy-site（/opt/shigu-infra/shigu-roco），公网入口 https://roco.shigu.zone
# 方式与 ShiGuZone/main scripts/release.ps1 一致：本地构建 → docker save + gzip → scp → 远端 load + compose up（不依赖镜像仓库）。
# 用法: powershell scripts/release.ps1 -Version 0.128.2 [-SkipChecks] [-SkipData] [-SkipUpload] [-SyncNginx]
#   -SkipChecks：跳过本地 pnpm check（lint / typecheck / 引擎测试），只做部署
#   -SkipData：跳过 data/ 同步（仅当服务器数据已是最新时用；数据变了不传会跑旧数据）
#   -SkipUpload：跳过镜像构建 / save / 上传，复用服务器 /tmp 上已有的同版本 tar.gz（部署步骤失败后重跑用）
#   -SyncNginx：强制用仓内版本覆盖服务器上的 nginx 站点配置
# nginx 站点：deploy/nginx/roco-shigu-zone.conf → /etc/nginx/conf.d/；证书由 certbot（nginx 认证器，HTTP-01）签发与自动续期。
#   ⚠️ 该文件首次上线后即归 certbot 管（它会补 listen 443 / 证书路径 / 80→443 跳转），**默认不再覆盖**，
#   否则每次发版都会把 HTTPS 段刷掉。只有站点还没建（服务器上不存在该文件）或显式 -SyncNginx 时才同步。
# 远端脚本一律用「单引号 here-string + 占位符替换」拼装：避开 PowerShell 与 bash 的 $ 转义互相干扰。
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$SshHost = "cspy-site",
  [string]$SshPort = "10076",
  [string]$ComposeDir = "/opt/shigu-infra/shigu-roco",
  [string]$HostPort = "18488",
  [string]$BaseUrl = "https://roco.shigu.zone",
  [switch]$SkipChecks,
  [switch]$SkipData,
  [switch]$SkipUpload,
  [switch]$SyncNginx,
  # 远端磁盘余量下限（GB）：低于它直接报错，避免 load 到一半把宿主机写满
  [int]$MinFreeGb = 10
)
$ErrorActionPreference = "Stop"
$builtAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$tmp = "C:\Users\Gu\AppData\Local\Temp\opencode"
$tar = "$tmp\shigu-rock-$Version.tar"
$gz = "$tmp\shigu-rock-$Version.tar.gz"
$image = "shigu-rock:$Version"
$composeFile = "compose.yaml"
$nginxConf = "deploy\nginx\roco-shigu-zone.conf"

function Check-Step([string]$step) {
  if ($LASTEXITCODE -ne 0) { Write-Error "步骤 $step 失败（exit=$LASTEXITCODE），已中止"; exit 1 }
}

# ssh 远端脚本必须是 LF：Windows 的 here-string 是 CRLF，直传会让远端 bash 每行末尾吃到 `\r`
function ToLf([string]$text) { return ($text -replace "`r`n", "`n") }

function Invoke-Remote([string]$script) {
  return ssh -o ConnectTimeout=30 -o BatchMode=yes $SshHost (ToLf $script)
}

function Get-LocalDataFiles {
  $root = (Resolve-Path "data").Path
  foreach ($file in Get-ChildItem -LiteralPath $root -Recurse -File) {
    [pscustomobject]@{
      Relative = [System.IO.Path]::GetRelativePath($root, $file.FullName).Replace('\', '/')
      FullName = $file.FullName
      Size     = [long]$file.Length
    }
  }
}

# 远端 data/ 已有文件（相对路径 → 字节数），用于增量同步：图鉴注册目录按 id 命名且不可变，只补新增
function Get-RemoteDataIndex {
  $findCmd = 'find ' + $ComposeDir + '/data -type f -printf ''%P|%s\n'' 2>/dev/null || true'
  $out = ssh -o ConnectTimeout=30 -o BatchMode=yes $SshHost $findCmd
  $map = @{}
  foreach ($line in $out) {
    $clean = "$line".Trim()
    if ($clean -match '^(.+)\|(\d+)$') { $map[$Matches[1]] = [long]$Matches[2] }
  }
  return $map
}

if (-not $SkipChecks) {
  Write-Host "==> 前置：本地 pnpm check（lint / typecheck / 引擎测试）"
  pnpm check ; Check-Step "前置 pnpm check"
}

Write-Host "==> 0/6 远端前置检查（磁盘余量 / 部署目录）"
$diskCheck = 'avail=$(df -BG --output=avail / | tail -1 | tr -dc "0-9"); echo "    远端 / 可用 ${avail}G（下限 ' + $MinFreeGb + 'G）"; test "$avail" -ge ' + $MinFreeGb
Invoke-Remote $diskCheck
Check-Step "0/6 远端磁盘余量不足 ${MinFreeGb}G —— 先清理：sudo docker image prune -f、删 /tmp 上的旧镜像包"
Invoke-Remote "sudo mkdir -p $ComposeDir/data && sudo chown -R ubuntu:ubuntu $ComposeDir"
Check-Step "0/6 创建远端部署目录"

Write-Host "==> 1/6 同步 data/（增量：按相对路径 + 字节数比对）"
if ($SkipData) {
  Write-Host "    （-SkipData：跳过）"
} else {
  $remoteIndex = Get-RemoteDataIndex
  $localFiles = @(Get-LocalDataFiles)
  $pending = @($localFiles | Where-Object { -not $remoteIndex.ContainsKey($_.Relative) -or $remoteIndex[$_.Relative] -ne $_.Size })
  $totalMb = [math]::Round((($pending | Measure-Object -Property Size -Sum).Sum / 1MB), 1)
  Write-Host "    本地 $($localFiles.Count) 个文件 / 需上传 $($pending.Count) 个（$totalMb MB）"
  if ($pending.Count -gt 0) {
    # 先建目录，再逐个 scp（图鉴注册每个目录一个 ~130MB 大文件，逐个传便于失败后重跑）
    # 注意：父目录必须用「/」切分——Windows 的 Split-Path 返回反斜杠，ssh 过去会被吞掉、建出错目录
    $dirs = $pending | ForEach-Object {
      $rel = $_.Relative
      if ($rel.Contains('/')) { $rel.Substring(0, $rel.LastIndexOf('/')) } else { $null }
    } | Sort-Object -Unique | Where-Object { $_ }
    foreach ($dir in $dirs) { Invoke-Remote "mkdir -p $ComposeDir/data/$dir" }
    foreach ($file in $pending) {
      Write-Host "    ↑ $($file.Relative)（$([math]::Round($file.Size / 1MB, 1)) MB）"
      scp -q -P $SshPort $file.FullName "${SshHost}:$ComposeDir/data/$($file.Relative)"
      Check-Step "1/6 上传 $($file.Relative)"
    }
  }
}

Write-Host "==> 2/6 更新 compose 镜像版本（$image）"
$yaml = [System.IO.File]::ReadAllText((Resolve-Path $composeFile))
$yaml = $yaml -replace 'image: shigu-rock:[0-9][0-9.]*', "image: shigu-rock:$Version"
[System.IO.File]::WriteAllText((Resolve-Path $composeFile), $yaml)
Select-String -Path $composeFile -Pattern 'image: shigu-' | ForEach-Object { "    " + $_.Line.Trim() }

Write-Host "==> 3/6 本地构建镜像"
if ($SkipUpload) {
  Write-Host "    （-SkipUpload：跳过构建，复用服务器上的 $Version tar.gz）"
} else {
  docker build -t $image --build-arg APP_VERSION=$Version --build-arg APP_BUILT_AT=$builtAt .
  Check-Step "3/6 构建镜像"
}

Write-Host "==> 4/6 docker save + 压缩 + 上传（镜像 / compose / nginx 站点）"
if (-not $SkipUpload) {
  docker save -o $tar $image
  Check-Step "4/6 save"
  $inputStream = [System.IO.File]::OpenRead($tar)
  $outputStream = [System.IO.File]::Create($gz)
  $gzip = New-Object System.IO.Compression.GzipStream($outputStream, [System.IO.Compression.CompressionMode]::Compress)
  $inputStream.CopyTo($gzip)
  $gzip.Dispose(); $outputStream.Dispose(); $inputStream.Dispose()
  Remove-Item $tar
  Write-Host "    $([math]::Round((Get-Item $gz).Length / 1MB, 1)) MB"
  scp -q -P $SshPort $gz "${SshHost}:/tmp/$(Split-Path $gz -Leaf)"
  Check-Step "4/6 上传镜像"
}
scp -q -P $SshPort $composeFile "${SshHost}:/tmp/shigu-rock-compose.yaml"
Check-Step "4/6 上传 compose"
# nginx 站点：首次（服务器上还没有该文件）或 -SyncNginx 才传。
# 签发证书后该文件归 certbot 管（它会补 listen 443 / 证书路径 / 80→443 跳转），默认不再覆盖，否则每次发版都会刷掉 HTTPS 段。
$remoteConfExists = "$(Invoke-Remote "test -f /etc/nginx/conf.d/roco-shigu-zone.conf && echo yes || echo no")".Trim() -eq "yes"
$pushNginx = $SyncNginx -or (-not $remoteConfExists)
if ($pushNginx) {
  # nginx 对 CRLF 敏感：上传前统一成 LF（仓内已是 LF，这里只防手工编辑带入 CRLF）
  $nginxTmp = "$tmp\roco-shigu-zone.conf"
  [System.IO.File]::WriteAllText($nginxTmp, (([System.IO.File]::ReadAllText((Resolve-Path $nginxConf))) -replace "`r`n", "`n"))
  scp -q -P $SshPort $nginxTmp "${SshHost}:/tmp/roco-shigu-zone.conf"
  Check-Step "4/6 上传 nginx 站点配置"
  Write-Host "    nginx 站点配置：$(if ($remoteConfExists) { "显式覆盖（-SyncNginx）" } else { "首次安装" })"
} else {
  Write-Host "    nginx 站点配置：服务器上已存在（归 certbot 管），跳过；要覆盖加 -SyncNginx"
}
Write-Host "==> 5/6 服务器 load + compose up + nginx reload"
$deploy = @'
set -e
cd __COMPOSE_DIR__
prevApp=$(sudo docker inspect -f '{{.Config.Image}}' shigu-rock 2>/dev/null || true)
sudo cp -f /tmp/shigu-rock-compose.yaml compose.yaml
if [ ! -f .env ]; then printf 'ROCO_HOST_PORT=__HOST_PORT__\n' | sudo tee .env > /dev/null; fi
sudo docker load -i /tmp/shigu-rock-__VERSION__.tar.gz
sudo docker compose up -d
sleep 8
sudo docker ps --format '{{.Names}} {{.Image}} {{.Status}}' | grep shigu-rock
if [ -f /tmp/roco-shigu-zone.conf ]; then
  sudo cp -f /tmp/roco-shigu-zone.conf /etc/nginx/conf.d/roco-shigu-zone.conf
  sudo nginx -t && sudo systemctl reload nginx
  echo 'nginx: 站点配置已同步'
fi
# 清理：保留本次与上一次镜像（回滚用），清 /tmp 上的旧镜像包
sudo docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^shigu-rock:' \
  | grep -vx "shigu-rock:__VERSION__" | grep -vx "${prevApp}" | xargs -r sudo docker rmi >/dev/null 2>&1 || true
sudo rm -f /tmp/shigu-rock-*.tar.gz
echo '--- 清理后磁盘 ---'
sudo df -h / | tail -1
'@
$deploy = $deploy.Replace('__COMPOSE_DIR__', $ComposeDir).Replace('__VERSION__', $Version).Replace('__HOST_PORT__', $HostPort)
Invoke-Remote $deploy
Check-Step "5/6 部署"

Write-Host "==> 6/6 冒烟：容器 + 公网入口"
$smoke = @'
set -u
# 首次健康检查要读激活图鉴（~130MB JSON），容器起来不一定立刻 200：轮询等待，最多 180s
deadline=$((SECONDS + 180))
code=000
while [ "$code" != "200" ] && [ "$SECONDS" -lt "$deadline" ]; do
  code=$(curl -s -o /tmp/rock-health.json -w '%{http_code}' 'http://127.0.0.1:__HOST_PORT__/api/engine/health' || true)
  [ "$code" = "200" ] || { echo "    等待容器就绪…（当前 $code，已等 ${SECONDS}s）"; sleep 5; }
done
echo "health(internal)=$code"
cat /tmp/rock-health.json; echo
rm -f /tmp/rock-health.json
if [ "$code" != "200" ]; then echo '冒烟失败：容器 /api/engine/health 未返回 200'; exit 1; fi
echo -n 'home='; curl -s -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:__HOST_PORT__/'
echo -n 'public='; curl -s -o /dev/null -w '%{http_code}\n' '__BASE_URL__/' \
  || echo '（公网入口未就绪：DNS 记录 / 证书尚未生效——不影响本次发布）'
echo -n 'public-health='; curl -s -o /dev/null -w '%{http_code}\n' '__BASE_URL__/api/engine/health' \
  || echo '（同上）'
'@
$smoke = $smoke.Replace('__HOST_PORT__', $HostPort).Replace('__BASE_URL__', $BaseUrl)
Invoke-Remote $smoke
Check-Step "6/6 冒烟（容器健康检查未通过，见上方输出）"

Write-Host "完成: $image 已部署（容器 127.0.0.1:$HostPort），公网入口 $BaseUrl"

Write-Host "==> 7/7 清理本地临时文件"
if (Test-Path $gz) {
  Remove-Item $gz -Force
  Write-Host "    已删除 $gz（部署失败时不会走到这里，包会保留供排查）"
}
