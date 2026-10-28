param(
    [string]$RomPath = 'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba'
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$toolRoot = Join-Path $PSScriptRoot '.tools'
$ghidraHome = Join-Path $toolRoot 'ghidra-11/ghidra_11.4.3_PUBLIC'
$javaHome = Join-Path $toolRoot 'temurin21/jdk-21.0.12.1+1'
$headless = Join-Path $ghidraHome 'support/analyzeHeadless.bat'
$javaScript = Join-Path $PSScriptRoot 'EggoGhidraExport.java'
$ghidraScriptDir = Join-Path $toolRoot 'eggo-ghidra-scripts'
$rom = (Resolve-Path -LiteralPath $RomPath).Path
$romImport = Join-Path $toolRoot 'EggoReference.gba'

foreach ($required in @($headless, (Join-Path $javaHome 'bin/java.exe'), $javaScript)) {
    if (!(Test-Path -LiteralPath $required)) { throw "Required local Ghidra file is missing: $required" }
}

$stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$outputRoot = Join-Path $PSScriptRoot "OUTPUT/eggo-ghidra-controller_$stamp"
$projectDir = Join-Path $outputRoot 'project'
New-Item -ItemType Directory -Force -Path $projectDir,$ghidraScriptDir | Out-Null
Copy-Item -LiteralPath $javaScript -Destination (Join-Path $ghidraScriptDir 'EggoGhidraExport.java') -Force
$romHash = (Get-FileHash -LiteralPath $rom -Algorithm SHA256).Hash.ToLowerInvariant()
if (!(Test-Path -LiteralPath $romImport)) {
    try { New-Item -ItemType HardLink -Path $romImport -Target $rom | Out-Null }
    catch { Copy-Item -LiteralPath $rom -Destination $romImport }
}
if ((Get-FileHash -LiteralPath $romImport -Algorithm SHA256).Hash.ToLowerInvariant() -ne $romHash) {
    throw 'Local Ghidra ROM link/copy does not match the source ROM SHA-256.'
}

$parameters = [ordered]@{
    experiment = 'eggo-ghidra-controller'
    started_local = (Get-Date).ToString('o')
    ghidra_release = '11.4.3_PUBLIC'
    ghidra_headless = $headless
    java = (Join-Path $javaHome 'bin/java.exe')
    max_heap = '2G'
    rom = $rom
    rom_import_path = $romImport
    rom_bytes = (Get-Item -LiteralPath $rom).Length
    rom_sha256 = $romHash
    loader = 'BinaryLoader'
    rom_base = '0x08000000'
    processor = 'ARM:LE:32:v4t'
    thumb_context_range = @('0x08005f00', '0x08008300')
    functions = [ordered]@{
        cpu_route_search = '0x08005f48'
        cpu_survival_controller = '0x080065f8'
        cpu_timer_gate = '0x080066ac'
        cpu_ordinary_piece_policy = '0x08006a14'
        cpu_special_item_policy = '0x08006db4'
        cpu_candidate_sweep = '0x080070ac'
        cpu_candidate_scoring = '0x08007208'
        cpu_movement_policy = '0x08007abc'
        cpu_horizontal_steering = '0x08007dc4'
        cpu_enemy_avoidance = '0x08007ef0'
        cpu_rotation_gate = '0x0800819a'
        cpu_direction_filter = '0x080081fc'
    }
    output = $outputRoot
    limits = 'Static analysis of selected verified Survival/Hard CPU routines; not a whole-game decompilation or parity proof.'
}
$parameters | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputRoot 'parameters.json') -Encoding utf8

$env:JAVA_HOME = $javaHome
$env:PATH = (Join-Path $javaHome 'bin') + ';' + $env:PATH
$env:GHIDRA_HEADLESS_MAXMEM = '2G'
$log = Join-Path $outputRoot 'headless.log'
$projectName = 'EggoSurvivalHard'

& $headless $projectDir $projectName `
    -import $romImport `
    -loader BinaryLoader `
    -loader-baseAddr '0x08000000' `
    -loader-blockName ROM `
    -processor 'ARM:LE:32:v4t' `
    -cspec default `
    -noanalysis `
    -scriptPath $ghidraScriptDir `
    -preScript 'EggoGhidraExport.java' prepare $outputRoot `
    -postScript 'EggoGhidraExport.java' export $outputRoot `
    -analysisTimeoutPerFile 900 `
    -max-cpu 2 *> $log
$exitCode = $LASTEXITCODE
$parameters.ended_local = (Get-Date).ToString('o')
$parameters.exit_code = $exitCode
$parameters | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputRoot 'parameters.json') -Encoding utf8
if ($exitCode -ne 0) { throw "Headless Ghidra failed with exit code $exitCode. See $log" }
Write-Output $outputRoot
