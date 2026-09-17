param([ValidateSet('minimize','restore')][string]$Action, [ValidatePattern('^[a-f0-9]{32}$')][string]$Marker)
$ErrorActionPreference = 'Stop'
try {
    Add-Type -Path (Join-Path $PSScriptRoot 'main-window.cs')
    $ok = [CoffeeTideMainWindow]::Run($Action, $Marker)
    @{ ok = $ok } | ConvertTo-Json -Compress
} catch { '{"ok":false}' }
