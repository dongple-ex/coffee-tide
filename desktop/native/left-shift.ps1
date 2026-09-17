param([switch]$TestOnly)
$ErrorActionPreference = 'Stop'
try {
    if ($TestOnly) {
        Add-Type -TypeDefinition ((Get-Content -LiteralPath (Join-Path $PSScriptRoot 'left-shift.cs') -Raw) + [Environment]::NewLine + (Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\test\left-shift-cases.cs') -Raw))
        [CoffeeTide.GestureTests]::Run()
    } else {
        Add-Type -Path (Join-Path $PSScriptRoot 'left-shift.cs')
        [CoffeeTide.LeftShiftHook]::Run()
    }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
