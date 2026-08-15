@echo off
title RapidRescue Backend + Public Tunnel
cd /d "%~dp0backend"
echo.
echo  RapidRescue - Starting backend + public tunnel...
echo  Keep this window open while using the mobile app.
echo  Wait until you see "Public URL ready" — then ANY phone can log in.
echo  Reload Expo once after the public URL appears.
echo.
npm run start:all
pause
