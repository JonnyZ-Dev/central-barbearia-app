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

cd /d "%~dp0"

tar -a -c -f "BarbeariaVIP_Instalador.zip" --exclude=".git" --exclude="backups" --exclude="scratch" --exclude="database/auth_info_baileys" --exclude="BarbeariaVIP_Instalador.zip" *

if %ERRORLEVEL% EQU 0 (
    echo.
    echo =======================================================
    echo  [OK] ARQUIVO ZIP GERADO COM SUCESSO!
    echo  Arquivo: BarbeariaVIP_Instalador.zip
    echo =======================================================
    echo Agora basta copiar esse arquivo .zip para o seu Pen Drive!
) else (
    echo.
    echo [ERRO] Falha ao gerar o arquivo zip.
)

echo.
pause
