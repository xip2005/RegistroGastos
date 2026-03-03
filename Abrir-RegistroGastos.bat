@echo off
setlocal

cd /d "%~dp0"

echo ===============================
echo   Registro de Gastos - Inicio
echo ===============================
echo.

set "NODE_MISSING=0"
where node >nul 2>nul
if errorlevel 1 (
  set "NODE_MISSING=1"
)

where npm >nul 2>nul
if errorlevel 1 (
  set "NODE_MISSING=1"
)

if "%NODE_MISSING%"=="1" (
  echo Node.js o npm no estan disponibles. Intentando instalar Node.js LTS...
  where winget >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] No se encontro winget en este equipo.
    echo Instala Node.js LTS manualmente desde: https://nodejs.org
    pause
    exit /b 1
  )

  winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
  if errorlevel 1 (
    echo [ERROR] No se pudo instalar Node.js con winget.
    echo Prueba ejecutando este .bat como Administrador o instala Node.js manualmente.
    pause
    exit /b 1
  )

  set "PATH=%PATH%;C:\Program Files\nodejs;C:\Users\%USERNAME%\AppData\Local\Programs\nodejs"

  where node >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] Node.js se instalo pero no se detecta en PATH aun.
    echo Cierra y vuelve a abrir este .bat.
    pause
    exit /b 1
  )

  where npm >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] npm no se detecta aun.
    echo Cierra y vuelve a abrir este .bat.
    pause
    exit /b 1
  )
)

if not exist "node_modules" (
  echo Instalando dependencias por primera vez...
  if exist "package-lock.json" (
    call npm ci
  ) else (
    call npm install
  )
  if errorlevel 1 (
    echo [ERROR] Fallo la instalacion de dependencias.
    pause
    exit /b 1
  )
)

start "" cmd /c "timeout /t 4 >nul && start http://localhost:5173"

echo Iniciando aplicacion...
call npm run dev

endlocal
