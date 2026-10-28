@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\share.ps1" %*
if errorlevel 1 pause
