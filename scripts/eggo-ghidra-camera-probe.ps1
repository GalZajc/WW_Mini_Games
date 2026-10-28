param(
    [Parameter(Mandatory = $true)]
    [string]$AnalysisFolder
)

$ErrorActionPreference = 'Stop'
$analysis = (Resolve-Path -LiteralPath $AnalysisFolder).Path
$sourceProject = Join-Path $PSScriptRoot 'OUTPUT/eggo-ghidra-actor-contact_2026-10-07_07-25-56/project'
$toolRoot = Join-Path $PSScriptRoot '.tools'
$ghidraHome = Join-Path $toolRoot 'ghidra-11/ghidra_11.4.3_PUBLIC'
$javaHome = Join-Path $toolRoot 'temurin21/jdk-21.0.12.1+1'
$headless = Join-Path $ghidraHome 'support/analyzeHeadless.bat'
$javaScript = Join-Path $PSScriptRoot 'EggoGhidraCameraProbe.java'
$ghidraScriptDir = Join-Path $toolRoot 'eggo-ghidra-survival-scripts'

foreach ($required in @($headless, (Join-Path $javaHome 'bin/java.exe'), $javaScript, $sourceProject)) {
    if (!(Test-Path -LiteralPath $required)) { throw "Required Ghidra input is missing: $required" }
}
Copy-Item -LiteralPath $javaScript -Destination (Join-Path $ghidraScriptDir 'EggoGhidraCameraProbe.java') -Force
$env:JAVA_HOME = $javaHome
$env:PATH = (Join-Path $javaHome 'bin') + ';' + $env:PATH
$env:GHIDRA_HEADLESS_MAXMEM = '2G'
$log = Join-Path $analysis 'headless.log'

& $headless $sourceProject 'EggoSurvivalIndex' `
    -process 'EggoReference.gba' `
    -noanalysis `
    -scriptPath $ghidraScriptDir `
    -postScript 'EggoGhidraCameraProbe.java' $analysis `
    -max-cpu 1 *> $log
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0 -or (Select-String -LiteralPath $log -SimpleMatch 'ERROR REPORT SCRIPT ERROR' -Quiet)) {
    throw "Targeted Ghidra camera probe failed (exit code $exitCode or script error). See $log"
}
Write-Output "Ghidra camera probe completed: $(Join-Path $analysis 'camera-input-helper.txt')"
