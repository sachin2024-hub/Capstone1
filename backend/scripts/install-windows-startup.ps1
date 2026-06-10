# Run once to auto-start RapidRescue backend + tunnel when Windows logs in.

# Right-click → Run with PowerShell (as your user account)



$BackendDir = Split-Path -Parent $PSScriptRoot

$HiddenLauncher = Join-Path $PSScriptRoot "run-hidden.vbs"

$TaskName = "RapidRescue-AutoStart"



Write-Host "Installing Windows startup task: $TaskName" -ForegroundColor Cyan

Write-Host "Backend folder: $BackendDir" -ForegroundColor Gray



$wscript = Join-Path $env:Windir "System32\wscript.exe"

if (-not (Test-Path $wscript)) {

  Write-Host "ERROR: wscript.exe not found." -ForegroundColor Red

  exit 1

}



if (-not (Test-Path $HiddenLauncher)) {

  Write-Host "ERROR: run-hidden.vbs not found." -ForegroundColor Red

  exit 1

}



# Hidden background start — no CMD window on login

$action = New-ScheduledTaskAction `

  -Execute $wscript `

  -Argument "`"$HiddenLauncher`"" `

  -WorkingDirectory $BackendDir



$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME



$settings = New-ScheduledTaskSettingsSet `

  -AllowStartIfOnBatteries `

  -DontStopIfGoingOnBatteries `

  -StartWhenAvailable `

  -RestartCount 3 `

  -RestartInterval (New-TimeSpan -Minutes 1)



Register-ScheduledTask `

  -TaskName $TaskName `

  -Action $action `

  -Trigger $trigger `

  -Settings $settings `

  -Description "Auto-start RapidRescue backend and Cloudflare tunnel on login (hidden)" `

  -Force | Out-Null



Write-Host ""

Write-Host "Done! RapidRescue starts in the BACKGROUND when you log in (no CMD window)." -ForegroundColor Green

Write-Host ""

Write-Host "Manual start anytime:" -ForegroundColor Yellow

Write-Host "  Double-click START-RAPIDRESCUE.bat" -ForegroundColor White

Write-Host ""

Write-Host "To remove auto-start:" -ForegroundColor Yellow

Write-Host "  Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false" -ForegroundColor White

