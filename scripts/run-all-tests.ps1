<#
.SYNOPSIS
  Run all portfolio-report tests and report results.
.DESCRIPTION
  Executes every test_*.js file in the scripts/ folder.
  Returns exit code 0 on all-pass, 1 on any failure.
.EXAMPLE
  pwsh -File scripts/run-all-tests.ps1
#>
param(
  [switch]$Verbose
)

$ErrorActionPreference = 'Continue'
$scriptDir = $PSScriptRoot
$testFiles = Get-ChildItem -Path $scriptDir -Filter 'test_*.js' | Sort-Object Name

$total = 0
$passed = 0
$failed = 0
$failedTests = @()

Write-Host "`n╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       Portfolio Report — Test Suite              ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

foreach ($tf in $testFiles) {
  $total++
  Write-Host "Running: $($tf.Name)" -ForegroundColor Yellow
  $output = & node $tf.FullName 2>&1

  if ($LASTEXITCODE -eq 0) {
    $passed++
    # Show summary line only (last non-empty line)
    $lines = ($output | Out-String).Trim().Split("`n")
    $summary = $lines[-1].Trim()
    Write-Host "  ✓ $summary" -ForegroundColor Green
    if ($Verbose) {
      $output | ForEach-Object { Write-Host "    $_" }
    }
  } else {
    $failed++
    $failedTests += $tf.Name
    Write-Host "  ✗ FAILED" -ForegroundColor Red
    $output | ForEach-Object { Write-Host "    $_" }
  }
  Write-Host ""
}

Write-Host "══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Total: $total | Passed: $passed | Failed: $failed" -ForegroundColor $(if ($failed -eq 0) { 'Green' } else { 'Red' })

if ($failedTests.Count -gt 0) {
  Write-Host "`nFailed test files:" -ForegroundColor Red
  $failedTests | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}

Write-Host ""

if ($failed -gt 0) {
  exit 1
} else {
  Write-Host "All tests passed." -ForegroundColor Green
  exit 0
}
