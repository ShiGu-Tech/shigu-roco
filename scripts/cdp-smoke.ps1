# CDP 真时驱动 headless Edge：navigate → 等条件 → 可选点击 → 截图
# 用法：pwsh scripts/cdp-smoke.ps1 -Url <url> -WaitText "状态编辑" -ClickText "单步" -Out <png>
param(
  [Parameter(Mandatory)][string]$Url,
  [string]$WaitText,
  [string]$ClickText,
  [Parameter(Mandatory)][string]$Out,
  [int]$TimeoutSec = 60,
  [int]$Width = 1440,
  [int]$Height = 900,
  [int]$Port = 9432
)

$ErrorActionPreference = "Stop"
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$profile = Join-Path $env:TEMP "opencode\edge-cdp-$Port"
if (Test-Path $profile) { Remove-Item -Recurse -Force $profile }
New-Item -ItemType Directory -Path $profile | Out-Null

$proc = Start-Process -FilePath $edge -PassThru -WindowStyle Hidden -ArgumentList @(
  "--headless=new", "--disable-gpu", "--no-sandbox",
  "--user-data-dir=$profile",
  "--remote-debugging-port=$Port",
  "--window-size=$Width,$Height",
  "about:blank"
)

try {
  $target = $null
  foreach ($i in 1..40) {
    Start-Sleep -Milliseconds 500
    try {
      $list = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json" -TimeoutSec 2
      $target = $list | Where-Object { $_.type -eq "page" } | Select-Object -First 1
      if ($target) { break }
    } catch { }
  }
  if (-not $target) { throw "CDP 未就绪（端口 $Port）" }

  $ws = [System.Net.WebSockets.ClientWebSocket]::new()
  $ws.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null

  $script:msgId = 0
  function Send-Cdp([string]$method, $params) {
    $script:msgId++
    $payload = @{ id = $script:msgId; method = $method; params = $params } | ConvertTo-Json -Depth 8 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
    $seg = [ArraySegment[byte]]::new($bytes)
    $ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
    return $script:msgId
  }

  function Read-Cdp {
    $buffer = New-Object byte[] 2097152
    $seg = [ArraySegment[byte]]::new($buffer)
    $ms = [IO.MemoryStream]::new()
    do {
      $result = $ws.ReceiveAsync($seg, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
      $ms.Write($buffer, 0, $result.Count)
    } while (-not $result.EndOfMessage)
    return [Text.Encoding]::UTF8.GetString($ms.ToArray())
  }

  # 丢弃事件直到等到指定 id 的回包
  function Wait-Cdp([int]$id, [int]$timeoutMs = 30000) {
    $deadline = [DateTime]::UtcNow.AddMilliseconds($timeoutMs)
    while ([DateTime]::UtcNow -lt $deadline) {
      $raw = Read-Cdp
      $msg = $raw | ConvertFrom-Json
      if ($msg.id -eq $id) { return $msg }
    }
    throw "CDP 等待超时（id=$id）"
  }

  function Eval([string]$expr) {
    $id = Send-Cdp "Runtime.evaluate" @{ expression = $expr; returnByValue = $true }
    $resp = Wait-Cdp $id 15000
    return $resp.result.result.value
  }

  Send-Cdp "Page.enable" @{} | Out-Null
  Send-Cdp "Runtime.enable" @{} | Out-Null
  Send-Cdp "Emulation.setDeviceMetricsOverride" @{ width = $Width; height = $Height; deviceScaleFactor = 1; mobile = $false } | Out-Null
  Send-Cdp "Page.navigate" @{ url = $Url } | Out-Null

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSec)
  if ($WaitText) {
    $ready = $false
    while ([DateTime]::UtcNow -lt $deadline) {
      Start-Sleep -Milliseconds 800
      $text = Eval "document.body.innerText"
      if ($text -and $text.Contains($WaitText)) { $ready = $true; break }
    }
    if (-not $ready) { throw "等待文本「$WaitText」超时（${TimeoutSec}s）" }
    Write-Output "READY: $WaitText"
  } else {
    Start-Sleep -Seconds ([Math]::Min($TimeoutSec, 15))
  }

  if ($ClickText) {
    foreach ($label in ($ClickText -split ",")) {
      $trimmed = $label.Trim()
      $clicked = Eval "(() => { const bs = [...document.querySelectorAll('button')]; const b = bs.find((x) => x.textContent.trim() === '$trimmed') || bs.find((x) => x.textContent.includes('$trimmed')); if (!b) return false; b.click(); return true; })()"
      Write-Output "CLICK $trimmed -> $clicked"
      Start-Sleep -Seconds 2
    }
    $text = Eval "document.body.innerText"
    [IO.File]::WriteAllText((Join-Path (Split-Path $Out) "cdp-after-click.txt"), $text)
  }

  $href = Eval "location.href"
  $title = Eval "document.title"
  Write-Output "AT: $href ($title)"
  Write-Output ("SCROLL: " + (Eval "document.documentElement.scrollWidth") + "/" + (Eval "window.innerWidth"))
  [IO.File]::WriteAllText((Join-Path (Split-Path $Out) "cdp-body.txt"), [string](Eval "document.body.innerText"))

  $shot = Send-Cdp "Page.captureScreenshot" @{ format = "png" }
  $resp = Wait-Cdp $shot 20000
  [IO.File]::WriteAllBytes($Out, [Convert]::FromBase64String($resp.result.data))
  Write-Output "SCREENSHOT: $Out"
} finally {
  if ($ws) { $ws.Dispose() }
  if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
}
