[CmdletBinding()]
param(
  [string]$ProjectRoot,
  [string]$DreamSkinRoot
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($DreamSkinRoot)) {
  $DreamSkinRoot = [IO.Path]::GetFullPath((Join-Path $scriptRoot '..\..'))
}
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = [IO.Path]::GetFullPath((Join-Path $DreamSkinRoot '..\..'))
}
$ledger = Join-Path $ProjectRoot 'state\chatgpt-generation-conversations.json'
$reportRoot = Join-Path $ProjectRoot 'reports\chatgpt-cleanup'
$runner = Join-Path $DreamSkinRoot 'skills\dispatch-chatgpt-bridge\scripts\run-bridge.ps1'

if (-not (Test-Path -LiteralPath $ledger -PathType Leaf)) {
  throw "Generation conversation lifecycle ledger not found: $ledger"
}
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) {
  throw "ChatGPT bridge runner not found: $runner"
}

New-Item -ItemType Directory -Path $reportRoot -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$report = Join-Path $reportRoot "cleanup-$stamp.json"

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runner `
  -Action cleanup `
  -Root $DreamSkinRoot `
  -InputPath $ledger `
  -OutputPath $report `
  -AllowDelete

if ($LASTEXITCODE -ne 0) {
  throw "Generation conversation cleanup failed. See report path when available: $report"
}

Write-Output $report
