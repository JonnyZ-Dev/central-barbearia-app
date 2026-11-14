import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sincronizarLidParaMensalista } from "@/lib/whatsapp-bot";

// Criar Mensalista
export async function POST(req: Request) {
  try {
    const data = await req.json();
    const db = getDb();

    const id = "ass-" + Date.now();
    const nome = data.nome?.trim();
    const whatsapp = data.whatsapp?.trim();
    const plano_id = data.plano_id;
    const valor_pago = Number(data.valor_pago || 0);
    const cortes_restantes = Number(data.cortes_restantes || 0);
    const barbas_restantes = Number(data.barbas_restantes || 0);
    const sobrancelhas_restantes = Number(data.sobrancelhas_restantes || 0);
    const data_inicio = data.data_inicio || new Date().toISOString().split("T")[0];
    const data_vencimento = data.data_vencimento;
    const status = data.status || "ATIVO";
    const observacoes = data.observacoes || "";

    if (!nome || !whatsapp || !data_vencimento) {
      return NextResponse.json({ error: "Nome, WhatsApp e Vencimento são obrigatórios." }, { status: 400 });
    }

    const stmt = db.prepare(`
      INSERT INTO mensalistas (
        id, nome, whatsapp, plano_id, valor_pago, cortes_restantes, barbas_restantes, sobrancelhas_restantes, data_inicio, data_vencimento, status, observacoes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, nome, whatsapp, plano_id, valor_pago, cortes_restantes, barbas_restantes, sobrancelhas_restantes, data_inicio, data_vencimento, status, observacoes);

    sincronizarLidParaMensalista(id).catch(() => {});

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error("ERRO POST /api/mensalistas:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Editar Mensalista Completo
export async function PUT(req: Request) {
  try {
    const data = await req.json();
    const db = getDb();

    const id = data.id;
    if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    const nome = data.nome?.trim();
    const whatsapp = data.whatsapp?.trim();
    const plano_id = data.plano_id;
    const valor_pago = Number(data.valor_pago || 0);
    const cortes_restantes = Number(data.cortes_restantes || 0);
    const barbas_restantes = Number(data.barbas_restantes || 0);
    const sobrancelhas_restantes = Number(data.sobrancelhas_restantes || 0);
    const data_vencimento = data.data_vencimento;
    const status = data.status || "ATIVO";
    const observacoes = data.observacoes || "";

    const stmt = db.prepare(`
      UPDATE mensalistas SET 
        nome = ?,
        whatsapp = ?,
        plano_id = ?,
        valor_pago = ?,
        cortes_restantes = ?,
        barbas_restantes = ?,
        sobrancelhas_restantes = ?,
        data_vencimento = ?,
        status = ?,
        observacoes = ?
      WHERE id = ?
    `);
    stmt.run(nome, whatsapp, plano_id, valor_pago, cortes_restantes, barbas_restantes, sobrancelhas_restantes, data_vencimento, status, observacoes, id);

    sincronizarLidParaMensalista(id).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("ERRO PUT /api/mensalistas:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Excluir Mensalista
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    const db = getDb();
    db.prepare("DELETE FROM historico_cortes WHERE mensalista_id = ?").run(id);
    db.prepare("DELETE FROM mensalistas WHERE id = ?").run(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("ERRO DELETE /api/mensalistas:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
