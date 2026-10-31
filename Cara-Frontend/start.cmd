@echo off
setlocal
cd /d "%~dp0"
echo Cara: http://127.0.0.1:5502/
echo Keep this window open while using checkout, accounts and orders.
echo Live Server on port 5501 can also use this service.
python server.py
if errorlevel 1 pause
