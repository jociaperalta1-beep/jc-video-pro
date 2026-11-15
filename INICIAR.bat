@echo off
setlocal
title JC VIDEO PRO - Servidor local
cd /d "%~dp0"
set PORT=8123

echo.
echo  ============================================
echo   JC VIDEO PRO - Iniciando editor local
echo  ============================================
echo.

where py >nul 2>nul
if errorlevel 1 goto trypython
set "PY=py"
goto startserver

:trypython
where python >nul 2>nul
if errorlevel 1 goto trynode
set "PY=python"
goto startserver

:trynode
where node >nul 2>nul
if errorlevel 1 goto nonode
echo Usando Node.js (serve)...
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://localhost:%PORT%'"
npx --yes serve -l %PORT% .
goto end

:startserver
echo Abriendo http://localhost:%PORT%
echo IMPORTANTE: deja esta ventana abierta mientras editas.
echo Para cerrar el editor, pulsa Ctrl+C o cierra esta ventana.
echo.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:%PORT%'"
%PY% -m http.server %PORT%
goto end

:nonode
echo.
echo  No se encontro Python ni Node.js en este equipo.
echo.
echo  Opcion 1: instala Python desde https://www.python.org/downloads/
echo            (marca "Add Python to PATH" durante la instalacion).
echo  Opcion 2: instala Node.js desde https://nodejs.org/
echo.
echo  Despues de instalarlo, vuelve a hacer doble clic en INICIAR.bat.
echo.
pause

:end
endlocal
