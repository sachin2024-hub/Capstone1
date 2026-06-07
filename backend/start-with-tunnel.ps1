# RapidRescue Backend + Tunnel Starter
# Run this script to start the backend AND expose it to the internet
# Usage: Right-click > Run with PowerShell

Write-Host "Starting RapidRescue Backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; node server.js"

Start-Sleep -Seconds 2

Write-Host "Starting localtunnel (exposing port 5000)..." -ForegroundColor Cyan
Write-Host ""
Write-Host "IMPORTANT: Copy the URL below and update services/api.ts in the mobile app!" -ForegroundColor Yellow
Write-Host ""

npx localtunnel --port 5000
