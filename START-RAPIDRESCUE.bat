@echo off
title RapidRescue Backend + Tunnel
cd /d "%~dp0backend"
echo.
echo  RapidRescue - Starting backend and tunnel...
echo  Keep this window open while using the mobile app.
echo.
npm run start:all
pause
