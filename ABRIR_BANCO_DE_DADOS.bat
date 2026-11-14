@echo off
title Visualizador do Banco de Dados - Barbearia VIP
color 0E

echo =======================================================
echo     VISUALIZADOR DO BANCO DE DADOS LOCAL (SQLITE)
echo =======================================================
echo.

set "DB_FILE=%~dp0database\barbearia.db"

if not exist "%DB_FILE%" (
    echo [!] Banco de dados ainda nao criado em:
    echo     %DB_FILE%
    echo O banco e criado automaticamente ao ligar o sistema.
    pause
    exit /b
)

:: 1. Tentar abrir com DB Browser for SQLite se estiver instalado no computador
if exist "C:\Program Files\DB Browser for SQLite\DB Browser for SQLite.exe" (
    start "" "C:\Program Files\DB Browser for SQLite\DB Browser for SQLite.exe" "%DB_FILE%"
    exit /b
)
if exist "C:\Program Files (x86)\DB Browser for SQLite\DB Browser for SQLite.exe" (
    start "" "C:\Program Files (x86)\DB Browser for SQLite\DB Browser for SQLite.exe" "%DB_FILE%"
    exit /b
)

:: 2. Se nao tiver o programa instalado, abre o painel interno do sistema
echo [OK] O arquivo do banco de dados SQLite existe e esta perfeito:
echo      %DB_FILE%
echo.
echo Nota: O programa externo "DB Browser for SQLite" nao esta instalado neste notebook,
echo mas o proprio sistema possui um Visualizador do Banco integrado no menu!
echo.
echo Deseja abrir o sistema no navegador para ver o Banco de Dados? (S/N)
set /p RESPOSTA="> "
if /i "%RESPOSTA%"=="S" (
    start http://localhost:3000
)

