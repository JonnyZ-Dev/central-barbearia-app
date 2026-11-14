import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Criar Plano
export async function POST(req: Request) {
  try {
    const data = await req.json();
    const db = getDb();

    const id = "pln-" + Date.now();
    const nome = data.nome?.trim();
    const preco_mensal = Number(data.preco_mensal || 0);
    const cortes_cabelo_inclusos = Number(data.cortes_cabelo_inclusos || 0);
    const barbas_inclusas = Number(data.barbas_inclusas || 0);
    const inclui_sobrancelha = data.inclui_sobrancelha ? 1 : 0;
    const descricao = data.descricao?.trim() || "";

    if (!nome || preco_mensal <= 0) {
      return NextResponse.json({ error: "Nome e preço mensal são obrigatórios." }, { status: 400 });
    }

    const stmt = db.prepare(`
      INSERT INTO planos (id, nome, preco_mensal, cortes_cabelo_inclusos, barbas_inclusas, inclui_sobrancelha, descricao, ativo)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `);
    stmt.run(id, nome, preco_mensal, cortes_cabelo_inclusos, barbas_inclusas, inclui_sobrancelha, descricao);

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error("ERRO POST /api/planos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Editar Plano
export async function PUT(req: Request) {
  try {
    const data = await req.json();
    const db = getDb();

    const id = data.id;
    if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    const nome = data.nome?.trim();
    const preco_mensal = Number(data.preco_mensal || 0);
    const cortes_cabelo_inclusos = Number(data.cortes_cabelo_inclusos || 0);
    const barbas_inclusas = Number(data.barbas_inclusas || 0);
    const inclui_sobrancelha = data.inclui_sobrancelha ? 1 : 0;
    const descricao = data.descricao?.trim() || "";
    const ativo = data.ativo !== false ? 1 : 0;

    const stmt = db.prepare(`
      UPDATE planos SET 
        nome = ?,
        preco_mensal = ?,
        cortes_cabelo_inclusos = ?,
        barbas_inclusas = ?,
        inclui_sobrancelha = ?,
        descricao = ?,
        ativo = ?
      WHERE id = ?
    `);
    stmt.run(nome, preco_mensal, cortes_cabelo_inclusos, barbas_inclusas, inclui_sobrancelha, descricao, ativo, id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("ERRO PUT /api/planos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Excluir Plano
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    const db = getDb();
    db.prepare("DELETE FROM planos WHERE id = ?").run(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("ERRO DELETE /api/planos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
