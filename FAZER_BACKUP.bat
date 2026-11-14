@echo off
title Barbearia VIP - Backup de Seguranca
color 0A

echo =======================================================
echo          BACKUP DO BANCO DE DADOS DA BARBEARIA
echo =======================================================
echo.

set "DATA_HORA=%date:~6,4%-%date:~3,2%-%date:~0,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%"
set "DATA_HORA=%DATA_HORA: =0%"

cd /d "%~dp0"

if not exist "backups" (
    mkdir "backups"
)

if exist "database\barbearia.db" (
    echo [*] Criando copia de seguranca do banco de dados SQLite...
    copy /Y "database\barbearia.db" "backups\barbearia_backup_%DATA_HORA%.db" >nul
    copy /Y "database\barbearia.db" "backups\barbearia_SNAPSHOT_GM.db" >nul
    echo.
    echo =======================================================
    echo  [OK] BACKUP CRIADO COM SUCESSO!
    echo  Arquivo salvo em: backups\barbearia_backup_%DATA_HORA%.db
    echo  Snapshot mestre:   backups\barbearia_SNAPSHOT_GM.db
    echo =======================================================
) else (
    echo [AVISO] Arquivo database\barbearia.db nao encontrado ainda.
)

echo.
pause
