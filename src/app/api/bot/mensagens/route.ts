import { NextResponse } from "next/server";
import { getDb, popularMensagensBot } from "@/lib/db";

// Obter todas as mensagens configuráveis na ordem lógica do menu
export async function GET() {
  try {
    const db = getDb();
    const mensagens = db.prepare("SELECT * FROM bot_mensagens ORDER BY ordem ASC, id ASC").all() || [];
    return NextResponse.json({ mensagens });
  } catch (error: any) {
    console.error("ERRO GET /api/bot/mensagens:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Atualizar o texto ou dados de uma mensagem
export async function PUT(req: Request) {
  try {
    const { id, mensagem, titulo, descricao, gatilho, categoria, ativo } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });
    }

    const db = getDb();
    db.prepare(`
      UPDATE bot_mensagens SET 
        mensagem = COALESCE(?, mensagem),
        titulo = COALESCE(?, titulo),
        descricao = COALESCE(?, descricao),
        gatilho = COALESCE(?, gatilho),
        categoria = COALESCE(?, categoria),
        ativo = ?,
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(
      mensagem ?? null,
      titulo ?? null,
      descricao ?? null,
      gatilho ?? null,
      categoria ?? null,
      ativo !== false ? 1 : 0,
      id
    );

    return NextResponse.json({ success: true, message: "Mensagem do robô atualizada no SQLite!" });
  } catch (error: any) {
    console.error("ERRO PUT /api/bot/mensagens:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Criar nova conversa ou restaurar padrões
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const db = getDb();

    if (body.acao === "RESTAURAR_PADRAO") {
      popularMensagensBot(db);
      return NextResponse.json({ success: true, message: "Mensagens restauradas para o padrão profissional da GM na ordem correta!" });
    }

    const { titulo, descricao, categoria, mensagem, variaveis_disponiveis, gatilho } = body;
    if (!titulo || !mensagem) {
      return NextResponse.json({ error: "Título e mensagem são obrigatórios!" }, { status: 400 });
    }

    const maxOrdemRow: any = db.prepare("SELECT MAX(ordem) as max_ordem FROM bot_mensagens").get();
    const novaOrdem = (maxOrdemRow?.max_ordem || 17) + 1;
    const novoId = `msg_custom_${Date.now()}`;

    db.prepare(`
      INSERT INTO bot_mensagens (id, titulo, descricao, categoria, mensagem, variaveis_disponiveis, gatilho, ordem, ativo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      novoId,
      titulo.trim(),
      descricao?.trim() || "Conversa personalizada cadastrada",
      categoria || "ATENDIMENTO",
      mensagem,
      variaveis_disponiveis || "{cliente}, {barbearia}, {link_booksy}, {pix}",
      gatilho?.trim() || "",
      novaOrdem
    );

    return NextResponse.json({ 
      success: true, 
      message: "Nova conversa adicionada ao robô com sucesso!",
      id: novoId 
    });
  } catch (error: any) {
    console.error("ERRO POST /api/bot/mensagens:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Excluir conversa customizada
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });
    }

    if (id === "msg_boas_vindas") {
      return NextResponse.json({ error: "O Menu de Boas-Vindas Principal não pode ser excluído." }, { status: 400 });
    }

    const db = getDb();
    db.prepare("DELETE FROM bot_mensagens WHERE id = ?").run(id);

    return NextResponse.json({ success: true, message: "Conversa removida do robô com sucesso!" });
  } catch (error: any) {
    console.error("ERRO DELETE /api/bot/mensagens:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
