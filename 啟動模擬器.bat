@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo KT89S51 實驗板模擬器 — 啟動本機服務 (http://127.0.0.1:8051/)
echo 關閉此視窗即停止服務。
start "" http://127.0.0.1:8051/
set PYTHONIOENCODING=utf-8
python server\app.py 8051
pause
