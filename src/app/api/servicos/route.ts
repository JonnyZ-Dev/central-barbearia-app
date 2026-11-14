import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Criar Serviço
export async function POST(req: Request) {
  try {
    const data = await req.json();
    const db = getDb();

    const id = "serv-" + Date.now();
    const nome = data.nome?.trim();
    const categoria = data.categoria || "Geral";
    const preco = Number(data.preco || 0);
    const preco_a_partir_de = data.preco_a_partir_de ? 1 : 0;
    const duracao_minutos = Number(data.duracao_minutos || 30);
    const descricao = data.descricao?.trim() || "";

    if (!nome || preco <= 0) {
      return NextResponse.json({ error: "Nome e Preço são obrigatórios" }, { status: 400 });
    }

    const stmt = db.prepare(`
      INSERT INTO servicos (id, nome, categoria, preco, preco_a_partir_de, duracao_minutos, descricao, ativo)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `);
    stmt.run(id, nome, categoria, preco, preco_a_partir_de, duracao_minutos, descricao);

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error("ERRO POST /api/servicos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Editar Serviço
export async function PUT(req: Request) {
  try {
    const data = await req.json();
    const db = getDb();

    const id = data.id;
    if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    const nome = data.nome?.trim();
    const categoria = data.categoria || "Geral";
    const preco = Number(data.preco || 0);
    const preco_a_partir_de = data.preco_a_partir_de ? 1 : 0;
    const duracao_minutos = Number(data.duracao_minutos || 30);
    const descricao = data.descricao?.trim() || "";
    const ativo = data.ativo !== false ? 1 : 0;

    const stmt = db.prepare(`
      UPDATE servicos SET 
        nome = ?,
        categoria = ?,
        preco = ?,
        preco_a_partir_de = ?,
        duracao_minutos = ?,
        descricao = ?,
        ativo = ?
      WHERE id = ?
    `);
    stmt.run(nome, categoria, preco, preco_a_partir_de, duracao_minutos, descricao, ativo, id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("ERRO PUT /api/servicos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Excluir Serviço
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    const db = getDb();
    db.prepare("DELETE FROM servicos WHERE id = ?").run(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("ERRO DELETE /api/servicos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
