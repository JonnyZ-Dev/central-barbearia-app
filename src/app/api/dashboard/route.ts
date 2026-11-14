import { NextResponse } from "next/server";
import { getDb, popularDadosIniciaisGM } from "@/lib/db";

export async function GET() {
  try {
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

    return NextResponse.json({
      config,
      mensalistas,
      historico,
      servicos,
      barbeiros,
      planos,
      banco: {
        tabelas,
        caminho: "E:\\ChatBot_MensalistasAPP\\database\\barbearia.db",
        driver: "Node.js Native SQLite (node:sqlite)"
      }
    });
  } catch (error: any) {
    console.error("ERRO GET /api/dashboard:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { acao } = await req.json();
    if (acao === "RESETAR_DADOS_GM") {
      const db = getDb();
      popularDadosIniciaisGM(db);
      return NextResponse.json({ success: true, message: "Dados da GM Barbershop importados com sucesso!" });
    }
    return NextResponse.json({ error: "Ação não reconhecida" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
