@echo off
title RapidRescue Frontend (Dashboard)
cd /d "%~dp0frontend\rapidrescue"
echo.
echo  RapidRescue - Starting the admin dashboard...
echo  Keep this window open while using the dashboard.
echo  The browser opens by itself. To stop, press Ctrl+C.
echo  The backend must also be running (START-RAPIDRESCUE.bat).
echo.
if not exist "node_modules\" (
    echo  First run: installing packages, please wait...
    call npm install
)
call npm run dev -- --open
pause
