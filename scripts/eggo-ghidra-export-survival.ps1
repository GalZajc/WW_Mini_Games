param(
    [Parameter(Mandatory = $true)]
    [string]$AnalysisFolder
)

$ErrorActionPreference = 'Stop'
$analysis = (Resolve-Path -LiteralPath $AnalysisFolder).Path
$projectRoot = Join-Path $analysis 'project'
$toolRoot = Join-Path $PSScriptRoot '.tools'
$ghidraHome = Join-Path $toolRoot 'ghidra-11/ghidra_11.4.3_PUBLIC'
$javaHome = Join-Path $toolRoot 'temurin21/jdk-21.0.12.1+1'
$headless = Join-Path $ghidraHome 'support/analyzeHeadless.bat'
$javaScript = Join-Path $PSScriptRoot 'EggoGhidraReachable.java'
$ghidraScriptDir = Join-Path $toolRoot 'eggo-ghidra-survival-scripts'

foreach ($required in @($headless, (Join-Path $javaHome 'bin/java.exe'), $javaScript, $projectRoot)) {
    if (!(Test-Path -LiteralPath $required)) { throw "Required Ghidra project file is missing: $required" }
}
Copy-Item -LiteralPath $javaScript -Destination (Join-Path $ghidraScriptDir 'EggoGhidraReachable.java') -Force
$utf8 = [System.Text.UTF8Encoding]::new($false)
$started = Get-Date
$env:JAVA_HOME = $javaHome
$env:PATH = (Join-Path $javaHome 'bin') + ';' + $env:PATH
$env:GHIDRA_HEADLESS_MAXMEM = '2G'
$log = Join-Path $analysis 'reachable-decompile.log'

& $headless $projectRoot 'EggoSurvivalIndex' `
    -process 'EggoReference.gba' `
    -noanalysis `
    -scriptPath $ghidraScriptDir `
    -postScript 'EggoGhidraReachable.java' $analysis `
    -max-cpu 1 *> $log
$exitCode = $LASTEXITCODE
$parametersPath = Join-Path $analysis 'parameters.json'
$parameters = Get-Content -LiteralPath $parametersPath -Raw | ConvertFrom-Json -AsHashtable
$parameters['reachable_decompile_started_local'] = $started.ToString('o')
$parameters['reachable_decompile_ended_local'] = (Get-Date).ToString('o')
$parameters['reachable_decompile_exit_code'] = $exitCode
$parameters['manually_seeded_actor_state_roots'] = @(
    '0x0800d748', '0x0800ded8', '0x0800dc28', '0x0800d814',
    '0x0800e0e8', '0x0800e040', '0x0800e068', '0x0800e0ac'
)
$parameters['actor_animation_dispatch_root'] = '0x0800ea36; measured selector handler at 0x0800ed50'
[System.IO.File]::WriteAllText($parametersPath, ($parameters | ConvertTo-Json -Depth 10), $utf8)
if ($exitCode -ne 0 -or (Select-String -LiteralPath $log -SimpleMatch 'ERROR REPORT SCRIPT ERROR' -Quiet)) {
    throw "Headless Ghidra callgraph export failed (exit code $exitCode or script error). See $log"
}
Get-Content -LiteralPath (Join-Path $analysis 'survival-reachable-summary.json')
