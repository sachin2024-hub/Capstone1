# RapidRescue — Backend + Tunnel (one command)
# Double-click or: Right-click > Run with PowerShell

Set-Location $PSScriptRoot
Write-Host "Starting RapidRescue backend + tunnel..." -ForegroundColor Cyan
Write-Host "Keep this window open while using the mobile app." -ForegroundColor Yellow
Write-Host ""
npm run start:all
