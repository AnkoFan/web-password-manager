param(
    [ValidateRange(5, 100)]
    [int]$Samples = 10,
    [ValidateRange(1, 4)]
    [int]$ConcurrentWorkers = 2,
    [string]$OutputPath
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$manifest = Join-Path $repoRoot "src-tauri\Cargo.toml"
$setup = Join-Path $PSScriptRoot "setup-rust-env.cmd"

if (-not $OutputPath) {
    $evidenceDirectory = Join-Path $repoRoot "docs\09-testing\evidence"
    New-Item -ItemType Directory -Force -Path $evidenceDirectory | Out-Null
    $OutputPath = Join-Path $evidenceDirectory "M3_KDF_BENCHMARK_WINDOWS.json"
}

$buildCommand = "call `"$setup`" && cargo.exe build --release --manifest-path `"$manifest`" --example kdf_benchmark"
cmd.exe /d /c $buildCommand
if ($LASTEXITCODE -ne 0) {
    throw "Unable to build the KDF benchmark."
}

$executable = Join-Path $repoRoot "src-tauri\target\release\examples\kdf_benchmark.exe"
if (-not (Test-Path -LiteralPath $executable)) {
    throw "The KDF benchmark executable was not produced."
}
$executableSha256 = (Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash.ToLowerInvariant()

$stdout = [System.IO.Path]::GetTempFileName()
$stderr = [System.IO.Path]::GetTempFileName()
try {
    $process = Start-Process -FilePath $executable `
        -ArgumentList @($Samples, $ConcurrentWorkers) `
        -PassThru `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr
    # Materialize the native handle before HasExited is polled. Windows
    # PowerShell can otherwise leave ExitCode unset after the process exits.
    $null = $process.Handle
    $peakWorkingSetBytes = 0L
    while (-not $process.HasExited) {
        $process.Refresh()
        if ($process.PeakWorkingSet64 -gt $peakWorkingSetBytes) {
            $peakWorkingSetBytes = $process.PeakWorkingSet64
        }
        Start-Sleep -Milliseconds 25
    }
    $process.WaitForExit()
    $process.Refresh()
    if ($process.PeakWorkingSet64 -gt $peakWorkingSetBytes) {
        $peakWorkingSetBytes = $process.PeakWorkingSet64
    }
    if ($process.ExitCode -ne 0) {
        throw "KDF benchmark failed with exit code $($process.ExitCode): $(Get-Content -Raw -LiteralPath $stderr)"
    }
    $benchmark = Get-Content -Raw -LiteralPath $stdout | ConvertFrom-Json
    $os = Get-CimInstance Win32_OperatingSystem
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
    $rustVersion = (& rustc.exe --version) -join ""
    $result = [ordered]@{
        recordedAt = (Get-Date).ToUniversalTime().ToString("o")
        testData = "TEST-ONLY fixed benchmark password and salt; no user data"
        operatingSystem = [ordered]@{
            family = "Windows"
            version = $os.Version
            buildNumber = $os.BuildNumber
            architecture = if ([Environment]::Is64BitOperatingSystem) { "x86_64" } else { "x86" }
        }
        processor = [ordered]@{
            name = $cpu.Name.Trim()
            logicalProcessors = $cpu.NumberOfLogicalProcessors
        }
        physicalMemoryBytes = [int64]$os.TotalVisibleMemorySize * 1024
        rustVersion = $rustVersion
        benchmarkExecutableSha256 = $executableSha256
        peakWorkingSetBytes = $peakWorkingSetBytes
        benchmark = $benchmark
    }
    $json = $result | ConvertTo-Json -Depth 8
    [System.IO.File]::WriteAllText(
        [System.IO.Path]::GetFullPath($OutputPath),
        $json + [Environment]::NewLine,
        [System.Text.UTF8Encoding]::new($false)
    )
    Write-Output "KDF benchmark evidence: $OutputPath"
}
finally {
    Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue
}
