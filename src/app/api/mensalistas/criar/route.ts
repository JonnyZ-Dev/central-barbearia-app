import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sincronizarLidParaMensalista } from "@/lib/whatsapp-bot";

export async function POST(req: Request) {
  try {
    const { nome, whatsapp, plano_id, cortes_restantes, data_vencimento } = await req.json();
    const db = getDb();

    const id = "cli-" + Date.now();
    db.prepare(`
      INSERT INTO mensalistas (id, nome, whatsapp, plano_id, cortes_restantes, data_vencimento)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, nome, whatsapp, plano_id, cortes_restantes, data_vencimento);

    sincronizarLidParaMensalista(id).catch(() => {});

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
