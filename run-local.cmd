@echo off
rem Builds the site and serves it together with the API on http://localhost:8788
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"
call node_modules\.bin\astro.cmd build || exit /b 1
call node_modules\.bin\wrangler.cmd pages dev dist --port 8788
