# CDP 真时驱动 headless Edge：navigate → 等条件 → 可选点击 → 可选有序动作 → 断言 → 截图
# 用法：pwsh scripts/cdp-smoke.ps1 -Url <url> -WaitText "状态编辑" -ClickText "单步" -Out <png>
# 有序动作（冒烟编辑回路）：-Actions "click:编辑|click:取值（路径）|edit:event.=x|check:未写回改动|checkabsent:✕"
#   click:<文案>  点击按钮或画布节点（按钮精确匹配优先，其次 .react-flow__node 文本包含）
#   edit:<匹配>=<值>  定位 value 含 <匹配> 的输入框，赋值并派发 focusout（CommitField 失焦提交）
#   check:<文案> / checkabsent:<文案>  断言页面文本含 / 不含，失败则退出码 1
#   eval:<js>  求值并回显（调试用，如 eval:localStorage.getItem('roco.atlasTrace')）
param(
  [Parameter(Mandatory)][string]$Url,
  [string]$WaitText,
  [string]$ClickText,
  [string]$Actions,
  [Parameter(Mandatory)][string]$Out,
  [int]$TimeoutSec = 60,
  [int]$Width = 1440,
  [int]$Height = 900,
  [int]$Port = 9432
)

$ErrorActionPreference = "Stop"
$script:failed = $false
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
      $clicked = Eval "(() => { const bs = [...document.querySelectorAll('button')]; const as = [...document.querySelectorAll('a')]; const nodes = [...document.querySelectorAll('.react-flow__node')]; const b = bs.find((x) => x.textContent.trim() === '$trimmed') || as.find((x) => x.textContent.trim() === '$trimmed') || nodes.find((x) => x.textContent.includes('$trimmed')) || bs.find((x) => x.textContent.includes('$trimmed')) || as.find((x) => x.textContent.includes('$trimmed')); if (!b) return false; b.click(); return true; })()"
      Write-Output "CLICK $trimmed -> $clicked"
      Start-Sleep -Seconds 2
    }
    $text = Eval "document.body.innerText"
    [IO.File]::WriteAllText((Join-Path (Split-Path $Out) "cdp-after-click.txt"), $text)
  }

  if ($Actions) {
    foreach ($step in ($Actions -split "\|")) {
      $s = $step.Trim()
      if ($s.StartsWith("click:")) {
        $label = $s.Substring(6)
        $clicked = Eval "(() => { const bs = [...document.querySelectorAll('button')]; const as = [...document.querySelectorAll('a')]; const nodes = [...document.querySelectorAll('.react-flow__node')]; const b = bs.find((x) => x.textContent.trim() === '$label') || as.find((x) => x.textContent.trim() === '$label') || nodes.find((x) => x.textContent.includes('$label')) || bs.find((x) => x.textContent.includes('$label')) || as.find((x) => x.textContent.includes('$label')); if (!b) return false; b.click(); return true; })()"
        Write-Output "CLICK $label -> $clicked"
        if (-not $clicked) { $script:failed = $true }
        Start-Sleep -Seconds 2
      } elseif ($s.StartsWith("edit:")) {
        $pair = $s.Substring(5)
        $idx = $pair.IndexOf("=")
        $match = $pair.Substring(0, $idx)
        $value = $pair.Substring($idx + 1)
        $r = Eval "(() => { const i = [...document.querySelectorAll('input')].find((x) => (x.value || '').includes('$match')); if (!i) return 'no-input'; i.focus(); i.value = '$value'; i.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); return 'ok'; })()"
        Write-Output "EDIT [$match] -> $r"
        if ($r -ne "ok") { $script:failed = $true }
        Start-Sleep -Seconds 2
      } elseif ($s.StartsWith("wait:")) {
        $t = $s.Substring(5)
        $ok = $false
        foreach ($i in 1..40) {
          Start-Sleep -Milliseconds 750
          if (Eval "document.body.innerText.includes(`"$t`")") { $ok = $true; break }
        }
        if ($ok) { Write-Output "WAIT ok: $t" } else { Write-Output "WAIT FAIL: $t"; $script:failed = $true }
      } elseif ($s.StartsWith("eval:")) {
        $js = $s.Substring(5)
        Write-Output ("EVAL " + $js + " -> " + (Eval $js))
      } elseif ($s.StartsWith("checkabsent:")) {        $t = $s.Substring(12)
        $ok = Eval "!document.body.innerText.includes(`"$t`")"
        if ($ok) { Write-Output "CHECK ok(absent): $t" } else { Write-Output "CHECK FAIL(absent): $t"; $script:failed = $true }
      } elseif ($s.StartsWith("check:")) {
        $t = $s.Substring(6)
        $ok = Eval "document.body.innerText.includes(`"$t`")"
        if ($ok) { Write-Output "CHECK ok: $t" } else { Write-Output "CHECK FAIL: $t"; $script:failed = $true }
      } else {
        throw "未知动作: $s"
      }
    }
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
if ($script:failed) { Write-Output "SMOKE FAILED"; exit 1 }
Write-Output "SMOKE OK"
