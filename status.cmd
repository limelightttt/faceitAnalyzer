@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\status.ps1" %*
if errorlevel 1 pause
