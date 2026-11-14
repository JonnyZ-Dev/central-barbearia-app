import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

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
        await runGit('git reset --mixed origin/main');
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
    // 1. Executa o git pull protegendo alterações locais
    const pullOutput = await runGit('git pull origin main');

    // 2. Retorna sucesso informando que os arquivos foram atualizados
    return NextResponse.json({
      sucesso: true,
      mensagem: 'Atualizações baixadas com sucesso!',
      detalhes: pullOutput,
    });
  } catch (error: any) {
    return NextResponse.json({
      sucesso: false,
      erro: error.message || 'Erro ao baixar atualizações do GitHub.',
    }, { status: 500 });
  }
}
