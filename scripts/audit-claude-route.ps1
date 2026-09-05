param(
  [int]$ClashPort = 7897,
  [string]$ClashConfigPath = "$env:APPDATA\io.github.clash-verge-rev.clash-verge-rev\clash-verge.yaml"
)

function Get-TcpConnectionsForProcess([int]$TargetProcessId) {
  try {
    return @(
      Get-NetTCPConnection -OwningProcess $TargetProcessId -ErrorAction Stop |
        Where-Object { $_.State -eq 'Established' }
    )
  } catch {
    # Win32_Process and Get-NetTCPConnection may be denied in sandboxed shells.
    # netstat still exposes the non-sensitive endpoint/owner relationship needed here.
    return @(
      netstat -ano -p tcp 2>$null |
        ForEach-Object {
          $fields = $_.Trim() -split '\s+'
          if ($fields.Count -lt 5 -or $fields[4] -ne [string]$TargetProcessId -or $fields[3] -ne 'ESTABLISHED') {
            return
          }

          $remoteEndpoint = $fields[2]
          $separator = $remoteEndpoint.LastIndexOf(':')
          if ($separator -lt 0) { return }

          [PSCustomObject]@{
            RemoteAddress = $remoteEndpoint.Substring(0, $separator).Trim('[', ']')
            RemotePort = [int]$remoteEndpoint.Substring($separator + 1)
            State = $fields[3]
          }
        }
    )
  }
}

$claudeProcesses = @(
  Get-Process -Name claude -ErrorAction SilentlyContinue |
    ForEach-Object {
      $processPath = $null
      try { $processPath = $_.Path } catch { $processPath = $null }

      [PSCustomObject]@{
        Name = "$($_.ProcessName).exe"
        ProcessId = $_.Id
        Path = $processPath
        Component = if ($processPath -match '(?:\\|/)claude-code(?:\\|/)') {
          'ClaudeCode'
        } elseif ($processPath -match 'WindowsApps(?:\\|/)Claude_') {
          'ClaudeDesktop'
        } else {
          'ClaudeUnknown'
        }
      }
    }
)

# Claude Desktop launches many helper processes with the same executable name.
# When an embedded/standalone Claude Code binary is identifiable, keep the report focused on it.
$identifiedClaudeCode = @($claudeProcesses | Where-Object { $_.Component -eq 'ClaudeCode' })
if ($identifiedClaudeCode.Count -gt 0) {
  $claudeProcesses = $identifiedClaudeCode
}

if ($claudeProcesses.Count -eq 0) {
  [PSCustomObject]@{
    Status = 'UNVERIFIED'
    Reason = 'No running Claude process was found. Run this again while Claude Code is making a request.'
    ClashPort = $ClashPort
  }
  return
}

$results = foreach ($claudeProcess in $claudeProcesses) {
  $connections = @(Get-TcpConnectionsForProcess $claudeProcess.ProcessId)
  $proxyConnections = @($connections | Where-Object {
    ($_.RemoteAddress -eq '127.0.0.1' -or $_.RemoteAddress -eq '::1') -and $_.RemotePort -eq $ClashPort
  })
  $otherConnections = @($connections | Where-Object {
    !(($_.RemoteAddress -eq '127.0.0.1' -or $_.RemoteAddress -eq '::1') -and $_.RemotePort -eq $ClashPort)
  })

  [PSCustomObject]@{
    Process = $claudeProcess.Name
    Pid = $claudeProcess.ProcessId
    Component = $claudeProcess.Component
    ExecutablePath = $claudeProcess.Path
    LocalClashLeg = if ($proxyConnections.Count -gt 0) { 'CONFIRMED' } else { 'NOT_OBSERVED' }
    LocalClashConnections = $proxyConnections.Count
    OtherEstablishedConnections = $otherConnections.Count
    Interpretation = if ($proxyConnections.Count -gt 0) {
      "Observed a $($claudeProcess.Component) connection to the local Clash port. Clash connection logs must still confirm the api.anthropic.com rule chain and final exit."
    } else {
      "No $($claudeProcess.Component) connection to the local Clash port was observed in this sample. The process may be idle or using another path; this alone does not prove bypass."
    }
  }
}

$results

if (Test-Path -LiteralPath $ClashConfigPath) {
  $configText = Get-Content -LiteralPath $ClashConfigPath -Raw
  $dnsBlock = [regex]::Match(
    $configText,
    '(?ms)^dns:\r?\n(?<body>.*?)(?=^[A-Za-z][A-Za-z0-9-]*:|\z)'
  ).Groups['body'].Value

  $dnsMode = [regex]::Match($dnsBlock, '(?m)^\s+enhanced-mode:\s*(?<value>\S+)').Groups['value'].Value
  $dnsIpv6 = [regex]::Match($dnsBlock, '(?m)^\s+ipv6:\s*(?<value>\S+)').Groups['value'].Value
  $respectRulesMatch = [regex]::Match($dnsBlock, '(?m)^\s+respect-rules:\s*(?<value>\S+)')
  $aiRuleCount = [regex]::Matches(
    $configText,
    '(?m)^-\s+DOMAIN-SUFFIX,[^,]+,AI住宅出口\s*$'
  ).Count

  [PSCustomObject]@{
    Check = 'ClashConfiguration'
    ConfigLastWriteTime = (Get-Item -LiteralPath $ClashConfigPath).LastWriteTime
    DnsEnhancedMode = if ($dnsMode) { $dnsMode } else { 'NOT_CONFIGURED' }
    DnsIpv6 = if ($dnsIpv6) { $dnsIpv6 } else { 'NOT_CONFIGURED' }
    DnsRespectRules = if ($respectRulesMatch.Success) { $respectRulesMatch.Groups['value'].Value } else { 'false (default)' }
    AiDomainRules = $aiRuleCount
    AiExitGroupPresent = $configText -match '(?m)^- name: AI住宅出口\s*$'
    AiFirstHopGroupPresent = $configText -match '(?m)^- name: AI首跳\s*$'
    DialerProxyLinks = [regex]::Matches($configText, '(?m)^\s+dialer-proxy:\s*AI首跳\s*$').Count
  }
}
