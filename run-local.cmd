@echo off
rem Local test server on http://localhost:8788 (site + API). Rebuilds automatically when admin content changes.
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"
node scripts\local.mjs
