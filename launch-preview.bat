@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch-preview.ps1" -WorkspaceRoot "%~dp0."
if errorlevel 1 pause
