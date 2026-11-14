import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Criar Barbeiro/Usuário
export async function POST(req: Request) {
  try {
    const data = await req.json();
    const db = getDb();

    const id = "barbeiro-" + Date.now();
    const nome = data.nome?.trim();
    const telefone_whatsapp = data.telefone_whatsapp?.trim();
    const email = data.email?.trim() || "";
    const tipo = data.tipo || "BARBEIRO";

    if (!nome || !telefone_whatsapp) {
      return NextResponse.json({ error: "Nome e WhatsApp são obrigatórios" }, { status: 400 });
    }

    const stmt = db.prepare(`INSERT INTO barbeiros (id, nome, telefone_whatsapp, email, tipo, ativo) VALUES (?, ?, ?, ?, ?, 1)`);
    stmt.run(id, nome, telefone_whatsapp, email, tipo);

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error("ERRO POST /api/usuarios:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Editar Barbeiro/Usuário
export async function PUT(req: Request) {
  try {
    const data = await req.json();
    const db = getDb();

    const id = data.id;
    if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    const nome = data.nome?.trim();
    const telefone_whatsapp = data.telefone_whatsapp?.trim();
    const email = data.email?.trim() || "";
    const tipo = data.tipo || "BARBEIRO";
    const ativo = data.ativo !== false ? 1 : 0;

    const stmt = db.prepare(`UPDATE barbeiros SET nome = ?, telefone_whatsapp = ?, email = ?, tipo = ?, ativo = ? WHERE id = ?`);
    stmt.run(nome, telefone_whatsapp, email, tipo, ativo, id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("ERRO PUT /api/usuarios:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Excluir Barbeiro
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    const db = getDb();
    db.prepare("DELETE FROM barbeiros WHERE id = ?").run(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("ERRO DELETE /api/usuarios:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
