@echo off
title RapidRescue - Install Windows Auto-Start
cd /d "%~dp0"
echo.
echo  Installing RapidRescue auto-start on Windows login...
echo.
powershell.exe -ExecutionPolicy Bypass -File "%~dp0install-windows-startup.ps1"
echo.
pause
