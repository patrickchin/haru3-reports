<#
.SYNOPSIS
  Sync EAS environment variables from Doppler. (Windows / PowerShell.)

.DESCRIPTION
  Vercel and Supabase have native Doppler integrations (auto-sync via the
  Doppler dashboard). EAS does not, so this script handles only EAS.

  Doppler config <-> EAS environment names are 1:1. Only EXPO_PUBLIC_* vars
  are pushed (the rest stay in Doppler).

.PARAMETER Environment
  development | preview | production

.EXAMPLE
  pwsh ./scripts/sync-eas.ps1 development
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('development', 'preview', 'production')]
  [string]$Environment
)

$ErrorActionPreference = 'Stop'

$tmp = Join-Path 'apps/mobile' '.env.sync'
try {
  doppler secrets download `
    --project harpa-pro --config $Environment `
    --no-file --format env |
    Where-Object { $_ -match '^EXPO_PUBLIC_' } |
    Set-Content -Path $tmp -Encoding utf8

  Push-Location 'apps/mobile'
  try {
    eas env:push --environment $Environment --path .env.sync --force
  } finally {
    Pop-Location
  }
} finally {
  if (Test-Path $tmp) { Remove-Item $tmp -Force }
}
