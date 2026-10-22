@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Download the LTS version from https://nodejs.org and try again. & pause & exit /b)
if not exist node_modules (
  echo Installing packages, this only happens the first time...
  call npm install
)
call npm start
pause
