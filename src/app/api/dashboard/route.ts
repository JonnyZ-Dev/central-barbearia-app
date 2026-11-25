import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { garantirBotIniciadoSeCredsExistem } from "@/lib/whatsapp-bot";
import os from "os";
import path from "path";

function getLocalIp(): string {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === "IPv4" && !net.internal) {
          return net.address;
        }
      }
    }
  } catch {}
  return "localhost";
}

export async function GET() {
  try {
    garantirBotIniciadoSeCredsExistem();
    const db = getDb();
    
    // Obter dados da barbearia
    const config = db.prepare("SELECT * FROM configuracoes WHERE id = 'default'").get() || {};

    // Obter mensalistas com detalhes do plano
    const mensalistas = db.prepare(`
      SELECT m.*, p.nome as plano_nome, p.cortes_cabelo_inclusos, p.barbas_inclusas, p.inclui_sobrancelha, p.preco_mensal
      FROM mensalistas m
      LEFT JOIN planos p ON m.plano_id = p.id
      ORDER BY m.created_at DESC
    `).all() || [];

    // Obter histórico recente de cortes
    const historico = db.prepare(`
      SELECT h.*, m.nome as mensalista_nome, b.nome as barbeiro_nome
      FROM historico_cortes h
      LEFT JOIN mensalistas m ON h.mensalista_id = m.id
      LEFT JOIN barbeiros b ON h.barbeiro_id = b.id
      ORDER BY h.data_corte DESC
      LIMIT 30
    `).all() || [];

    // Obter serviços
    const servicos = db.prepare("SELECT * FROM servicos ORDER BY categoria ASC, preco ASC").all() || [];

    // Obter barbeiros
    const barbeiros = db.prepare("SELECT * FROM barbeiros ORDER BY created_at ASC").all() || [];

    // Obter planos
    const planos = db.prepare("SELECT * FROM planos ORDER BY preco_mensal ASC").all() || [];

    // Metadados do banco
    const tabelasRows: any[] = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';").all() || [];
    const tabelas = tabelasRows.map(r => r.name);

    const ipLocal = getLocalIp();

    return NextResponse.json({
      config,
      mensalistas,
      historico,
      servicos,
      barbeiros,
      planos,
      rede: {
        ipLocal,
        porta: 3000,
        urlAcessoCelular: `http://${ipLocal}:3000`
      },
      banco: {
        tabelas,
        caminho: path.join(process.cwd(), "database", "barbearia.db"),
        driver: "Node.js Native SQLite (node:sqlite)"
      }
    });
  } catch (error: any) {
    console.error("ERRO GET /api/dashboard:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
