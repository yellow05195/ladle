@echo off
rem The Ladle mainnet keeper on this PC (until a VPS runs deploy/systemd/ladle-keeper.service).
rem Started by "Lancer Ladle mainnet.cmd", the desktop "Ladle keeper.cmd" and the Startup folder.
rem It restarts itself after a crash. %USERPROFILE%\.config\ladle\keeper-mode.txt picks its mode at each start:
rem   normal (or no file)  runs rounds
rem   shutdown             KEEPER_SHUTDOWN=1, set by scripts\mainnet-shutdown.ps1: pays every entry out after the notice, then stops
rem   off                  stops (the shutdown's drain or sweeps run from the script)
setlocal
title Ladle keeper (mainnet) - laisse cette fenetre ouverte
cd /d "%~dp0.."
set "KEYS=%USERPROFILE%\.config\ladle"
if not exist "config\deployments\mainnet-beta.json" (
  echo Ladle n'est pas encore lance sur mainnet: lance d'abord "Lancer Ladle mainnet.cmd".
  exit /b 1
)
netstat -ano | findstr /r /c:":8788 .*LISTENING" >nul && (
  echo Un keeper Ladle tourne deja sur ce PC. Rien a faire.
  exit /b 0
)
rem the mainnet settings of keeper.env (scripts\mainnet-up.ps1), the RPC and market from the deployment record
set KEEPER_CU_PRICE=auto
set KEEPER_CU_PRICE_MAX=100000
set KEEPER_MAX_FEE_SOL=0.0005
set KEEPER_SETTLE_STALL_MIN=10
set KEEPER_ALERT_BELOW_SOL=0.2

:loop
set "MODE=normal"
if exist "%KEYS%\keeper-mode.txt" set /p MODE=<"%KEYS%\keeper-mode.txt"
if /i "%MODE%"=="off" (
  echo Keeper arrete: le jeu est en cours de fermeture.
  exit /b 0
)
set KEEPER_SHUTDOWN=
if /i "%MODE%"=="shutdown" set KEEPER_SHUTDOWN=1
echo %date% %time% keeper start, mode %MODE%
node --experimental-strip-types --no-warnings keeper\src\index.ts --deployment config\deployments\mainnet-beta.json --keypair "%KEYS%\ladle-mainnet-keeper.json" --health-port 8788
set CODE=%errorlevel%
if "%CODE%"=="2" (
  echo Le keeper refuse sa configuration (voir ci-dessus^). Il ne redemarre pas.
  exit /b 2
)
if /i "%MODE%"=="shutdown" if "%CODE%"=="0" (
  echo Tout est paye et ferme: le keeper a fini. Relance "Recuperer mon argent Ladle.cmd".
  exit /b 0
)
echo %date% %time% keeper stopped (code %CODE%): restart in 15 s. Close this window to stop it.
timeout /t 15 /nobreak >nul
goto loop
