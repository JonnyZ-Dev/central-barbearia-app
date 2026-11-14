@echo off
title Barbearia VIP - Gerador de Pacote ZIP para Pen Drive
color 0B

echo =======================================================
echo     GERADOR DO ARQUIVO ZIP COMPLETO PARA O PEN DRIVE
echo =======================================================
echo.
echo Este utilitario compacta todo o sistema com as dependencias
echo instaladas (.next e node_modules) em UM UNICO ARQUIVO .ZIP!
echo.
echo [*] Gerando BarbeariaVIP_Instalador.zip (aguarde 1 minuto)...

set "ROOT=%~dp0\..\.."
set "DESTINO=%~dp0\..\celebrite\instalador\BarbeariaVIP_Instalador.zip"

cd /d "%ROOT%"

tar -a -c -f "%DESTINO%" --exclude=".git" --exclude="backups" --exclude="scratch" --exclude="barbearias" --exclude="database/auth_info_baileys" --exclude="*.zip" *

if %ERRORLEVEL% EQU 0 (
    echo.
    echo =======================================================
    echo  [OK] ARQUIVO ZIP GERADO COM SUCESSO!
    echo  Arquivo salvo em:
    echo  barbearias\celebrite\instalador\BarbeariaVIP_Instalador.zip
    echo =======================================================
    echo Agora basta copiar esse arquivo .zip para o seu Pen Drive!
) else (
    echo.
    echo [ERRO] Falha ao gerar o arquivo zip.
)

echo.
pause
