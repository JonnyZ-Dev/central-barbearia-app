import { NextResponse } from 'next/server';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);
const APP_DIR = process.cwd();

// Helper para executar comandos git no diretório do projeto com PATH estendido
async function runGit(command: string): Promise<string> {
  const env = {
    ...process.env,
    PATH: `C:\\Program Files\\Git\\cmd;E:\\;C:\\Program Files\\nodejs;${process.env.PATH || ''}`,
  };

  const { stdout } = await execAsync(command, {
    cwd: APP_DIR,
    env,
    timeout: 30000,
  });

  return stdout.trim();
}

/**
 * GET /api/sistema/atualizacoes
 * Verifica se há commits novos no repositório remoto sem quebrar nada.
 */
export async function GET() {
  try {
    // 1. Pega o hash do commit local atual
    let commitLocal = 'desconhecido';
    let dataCommit = '';
    try {
      commitLocal = await runGit('git rev-parse --short HEAD');
      dataCommit = await runGit('git log -1 --format=%cd --date=format:"%d/%m/%Y %H:%M"');
    } catch {
      // Repositório local ainda não inicializado. Se o Git estiver instalado na máquina, inicializa automaticamente
      try {
        await runGit('git init');
        await runGit('git remote add origin https://github.com/JonnyZ-Dev/central-barbearia-app.git');
        await runGit('git fetch origin main --quiet');
        await runGit('git branch -M main');
        await runGit('git reset --hard origin/main');
        commitLocal = await runGit('git rev-parse --short HEAD');
        dataCommit = await runGit('git log -1 --format=%cd --date=format:"%d/%m/%Y %H:%M"');
      } catch (autoInitErr) {
        return NextResponse.json({
          configurado: false,
          mensagem: 'Git não instalado neste notebook ou repositório não inicializado.',
        });
      }
    }

    // 2. Verifica se tem remote configurado
    let remoteUrl = '';
    try {
      remoteUrl = await runGit('git remote get-url origin');
    } catch {
      return NextResponse.json({
        configurado: false,
        versaoAtual: commitLocal,
        dataCommit,
        mensagem: 'Nenhum repositório remoto (origin) configurado ainda.',
      });
    }

    // 3. Tenta buscar novidades do remoto silenciosamente (git fetch)
    try {
      await runGit('git fetch origin main --quiet');
    } catch (fetchErr: any) {
      // Se estiver sem internet ou sem permissão de acesso ao repositório
      return NextResponse.json({
        configurado: true,
        versaoAtual: commitLocal,
        dataCommit,
        remoteUrl,
        temAtualizacao: false,
        aviso: 'Não foi possível conectar ao GitHub no momento (sem internet ou aguardando autenticação).',
      });
    }

    // 4. Compara o HEAD local com o origin/main
    let commitsAtras = 0;
    let novidades: string[] = [];

    try {
      const diffCount = await runGit('git rev-list --count HEAD..origin/main');
      commitsAtras = parseInt(diffCount, 10) || 0;

      if (commitsAtras > 0) {
        const logNovidades = await runGit('git log HEAD..origin/main --oneline -n 5');
        novidades = logNovidades.split('\n').filter(Boolean);
      }
    } catch {
      commitsAtras = 0;
    }

    return NextResponse.json({
      configurado: true,
      versaoAtual: commitLocal,
      dataCommit,
      remoteUrl,
      temAtualizacao: commitsAtras > 0,
      commitsAtras,
      novidades,
      mensagem: commitsAtras > 0
        ? `Existem ${commitsAtras} atualização(ões) disponível(is) no seu GitHub!`
        : 'Seu sistema está 100% atualizado com a versão mais recente.',
    });
  } catch (error: any) {
    return NextResponse.json({
      configurado: false,
      erro: error.message || 'Erro ao verificar atualizações.',
    }, { status: 500 });
  }
}

/**
 * POST /api/sistema/atualizacoes
 * Baixa e aplica as atualizações via git pull origin main
 */
export async function POST() {
  try {
    // 1. Executa o git fetch, branch -M main e reset --hard protegendo banco de dados e sessão
    await runGit('git fetch origin main');
    await runGit('git branch -M main');
    const pullOutput = await runGit('git reset --hard origin/main');

    // 2. Cria script temporário para compilar e reiniciar o servidor em segundo plano
    const batPath = path.join(APP_DIR, 'REINICIAR_ATUALIZACAO.bat');
    const batContent = `@echo off
cd /d "${APP_DIR}"
set "PATH=C:\\Program Files\\Git\\cmd;C:\\Program Files\\nodejs;%PATH%"
set "NODE_CMD=node"
if exist "C:\\Program Files\\nodejs\\node.exe" set "NODE_CMD=C:\\Program Files\\nodejs\\node.exe"
timeout /t 1 /nobreak >nul
for /f "tokens=5" %%p in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%p >nul 2>&1
call "%NODE_CMD%" node_modules\\next\\dist\\bin\\next build
start "Barbearia_Server" /min "%NODE_CMD%" node_modules\\next\\dist\\bin\\next start -p 3000 -H 0.0.0.0
start /b "" cmd /c "timeout /t 2 /nobreak >nul & del /f /q \"%~f0\""
exit
`;
    fs.writeFileSync(batPath, batContent);

    // 3. Dispara o script em processo filho independente (detached)
    const child = spawn('cmd.exe', ['/c', batPath], {
      cwd: APP_DIR,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    return NextResponse.json({
      sucesso: true,
      mensagem: 'Atualizações baixadas! O sistema está compilando a nova versão e recarregará a tela automaticamente.',
      detalhes: pullOutput,
    });
  } catch (error: any) {
    return NextResponse.json({
      sucesso: false,
      erro: error.message || 'Erro ao baixar atualizações do GitHub.',
    }, { status: 500 });
  }
}
