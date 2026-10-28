param(
    [string]$RomPath = 'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba'
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$toolRoot = Join-Path $PSScriptRoot '.tools'
$ghidraHome = Join-Path $toolRoot 'ghidra-11/ghidra_11.4.3_PUBLIC'
$javaHome = Join-Path $toolRoot 'temurin21/jdk-21.0.12.1+1'
$headless = Join-Path $ghidraHome 'support/analyzeHeadless.bat'
$javaScript = Join-Path $PSScriptRoot 'EggoGhidraSurvival.java'
$ghidraScriptDir = Join-Path $toolRoot 'eggo-ghidra-survival-scripts'
$rom = (Resolve-Path -LiteralPath $RomPath).Path
$romImport = Join-Path $toolRoot 'EggoReference.gba'

foreach ($required in @($headless, (Join-Path $javaHome 'bin/java.exe'), $javaScript)) {
    if (!(Test-Path -LiteralPath $required)) { throw "Required local Ghidra file is missing: $required" }
}

$stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$outputRoot = Join-Path $PSScriptRoot "OUTPUT/eggo-ghidra-survival_$stamp"
$projectDir = Join-Path $outputRoot 'project'
New-Item -ItemType Directory -Force -Path $projectDir,$ghidraScriptDir | Out-Null
Copy-Item -LiteralPath $javaScript -Destination (Join-Path $ghidraScriptDir 'EggoGhidraSurvival.java') -Force
$romHash = (Get-FileHash -LiteralPath $rom -Algorithm SHA256).Hash.ToLowerInvariant()
if (!(Test-Path -LiteralPath $romImport)) {
    try { New-Item -ItemType HardLink -Path $romImport -Target $rom | Out-Null }
    catch { Copy-Item -LiteralPath $rom -Destination $romImport }
}
if ((Get-FileHash -LiteralPath $romImport -Algorithm SHA256).Hash.ToLowerInvariant() -ne $romHash) {
    throw 'Local Ghidra ROM link/copy does not match the source ROM SHA-256.'
}

$started = Get-Date
$parameters = [ordered]@{
    experiment = 'eggo-ghidra-survival-index'
    started_local = $started.ToString('o')
    ghidra_release = '11.4.3_PUBLIC'
    java = (Join-Path $javaHome 'bin/java.exe')
    max_heap = '4G'
    max_cpu = 2
    rom = $rom
    rom_import_path = $romImport
    rom_bytes = (Get-Item -LiteralPath $rom).Length
    rom_sha256 = $romHash
    loader = 'BinaryLoader'
    rom_base = '0x08000000'
    processor = 'ARM:LE:32:v4t'
    entry = '0x08000000 (GBA cartridge ARM branch)'
    seeded_thumb_range = @('0x08005f00', '0x08008300')
    seeded_verified_roots = @(
        '0x08005f48','0x080065f8','0x080066ac','0x08006a14','0x08006db4',
        '0x080070ac','0x08007208','0x08007abc','0x08007dc4','0x08007ef0',
        '0x0800819a','0x080081fc'
    )
    analysis = 'Ghidra auto-analysis, then export function index and call edges'
    output = $outputRoot
    limits = '4 MiB local ROM; max 4 GiB Java heap and 2 CPUs. Function discovery can include false positives and does not constitute complete decompilation.'
}
$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText((Join-Path $outputRoot 'parameters.json'), ($parameters | ConvertTo-Json -Depth 8), $utf8)

$env:JAVA_HOME = $javaHome
$env:PATH = (Join-Path $javaHome 'bin') + ';' + $env:PATH
$env:GHIDRA_HEADLESS_MAXMEM = '4G'
$log = Join-Path $outputRoot 'headless.log'
$projectName = 'EggoSurvivalIndex'

& $headless $projectDir $projectName `
    -import $romImport `
    -loader BinaryLoader `
    -loader-baseAddr '0x08000000' `
    -loader-blockName ROM `
    -processor 'ARM:LE:32:v4t' `
    -cspec default `
    -scriptPath $ghidraScriptDir `
    -preScript 'EggoGhidraSurvival.java' prepare $outputRoot `
    -postScript 'EggoGhidraSurvival.java' export $outputRoot `
    -analysisTimeoutPerFile 900 `
    -max-cpu 2 *> $log
$exitCode = $LASTEXITCODE
$parameters.ended_local = (Get-Date).ToString('o')
$parameters.elapsed_seconds = [math]::Round(((Get-Date) - $started).TotalSeconds, 3)
$parameters.exit_code = $exitCode
[System.IO.File]::WriteAllText((Join-Path $outputRoot 'parameters.json'), ($parameters | ConvertTo-Json -Depth 8), $utf8)
$summaryPath = Join-Path $outputRoot 'analysis-summary.json'
if (Test-Path -LiteralPath $summaryPath) {
    $summary = Get-Content -LiteralPath $summaryPath -Raw | ConvertFrom-Json -AsHashtable
    $summary['analysisTimedOut'] = [bool](Select-String -LiteralPath $log -SimpleMatch 'Analysis timed out' -Quiet)
    $summary['analysisElapsedSeconds'] = $parameters.elapsed_seconds
    [System.IO.File]::WriteAllText($summaryPath, ($summary | ConvertTo-Json -Depth 6), $utf8)
}
if ($exitCode -ne 0) { throw "Headless Ghidra analysis failed with exit code $exitCode. See $log" }
Write-Output $outputRoot
