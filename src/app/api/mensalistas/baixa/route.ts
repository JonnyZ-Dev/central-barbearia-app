import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { enviarAvisoUltimoCorte } from "@/lib/whatsapp-bot";

export async function POST(req: Request) {
  const db = getDb();
  let emTransacao = false;

  try {
    const { mensalista_id, tipo_servico, barbeiro_id, observacao } = await req.json();

    // Buscar dados do mensalista e do plano
    const row: any = db.prepare(`
      SELECT m.*, p.cortes_cabelo_inclusos, p.barbas_inclusas, p.inclui_sobrancelha, p.nome as plano_nome
      FROM mensalistas m
      LEFT JOIN planos p ON m.plano_id = p.id
      WHERE m.id = ?
    `).get(mensalista_id);

    if (!row) {
      return NextResponse.json({ error: "Mensalista não encontrado" }, { status: 404 });
    }

    // AÇÃO 1: RENOVAÇÃO DE CICLO (+30 dias e recarrega os cortes/barbas)
    if (tipo_servico === "RENOVAR_CICLO") {
      const cortesRecarregados = Number(row.cortes_cabelo_inclusos || 4);
      const barbasRecarregadas = Number(row.barbas_inclusas || 0);
      const sobrancelhasRecarregadas = row.inclui_sobrancelha ? 1 : 0;

      const baseDate = new Date();
      baseDate.setDate(baseDate.getDate() + 30);
      const novoVencimento = baseDate.toISOString().split("T")[0];

      db.exec("BEGIN TRANSACTION;");
      emTransacao = true;

      db.prepare(`
        UPDATE mensalistas SET 
          cortes_restantes = ?, 
          barbas_restantes = ?, 
          sobrancelhas_restantes = ?, 
          data_vencimento = ?, 
          status = 'ATIVO' 
        WHERE id = ?
      `).run(cortesRecarregados, barbasRecarregadas, sobrancelhasRecarregadas, novoVencimento, mensalista_id);

      const histId = 'renov-' + Date.now();
      db.prepare(`
        INSERT INTO historico_cortes (id, mensalista_id, barbeiro_id, tipo_servico, observacao)
        VALUES (?, ?, ?, ?, ?)
      `).run(histId, mensalista_id, barbeiro_id || null, 'RENOVACAO_PLANO', `Renovação de ciclo do plano ${row.plano_nome}. Vencimento: ${novoVencimento}`);

      db.exec("COMMIT;");
      emTransacao = false;

      return NextResponse.json({
        success: true,
        acao: "RENOVADO",
        mensagem: `Plano de ${row.nome} renovado com sucesso até ${novoVencimento}!`,
        novoSaldoCabelo: cortesRecarregados,
        novoSaldoBarba: barbasRecarregadas,
        novoVencimento
      });
    }

    // AÇÃO 2: BAIXA DE CABELO
    if (tipo_servico === "CABELO") {
      const saldo = Number(row.cortes_restantes || 0);
      if (saldo <= 0) {
        return NextResponse.json({ error: `${row.nome} não possui cortes de cabelo restantes no plano!` }, { status: 400 });
      }

      const novoSaldo = saldo - 1;

      db.exec("BEGIN TRANSACTION;");
      emTransacao = true;

      db.prepare(`UPDATE mensalistas SET cortes_restantes = ? WHERE id = ?`).run(novoSaldo, mensalista_id);

      const histId = 'crt-' + Date.now();
      db.prepare(`
        INSERT INTO historico_cortes (id, mensalista_id, barbeiro_id, tipo_servico, observacao)
        VALUES (?, ?, ?, ?, ?)
      `).run(histId, mensalista_id, barbeiro_id || null, 'CABELO', observacao || "Baixa de Corte de Cabelo");

      db.exec("COMMIT;");
      emTransacao = false;

      // Se utilizou o último corte de cabelo (saldo zerou), dispara aviso automático no WhatsApp
      if (novoSaldo === 0) {
        enviarAvisoUltimoCorte(mensalista_id).catch(() => {});
      }

      return NextResponse.json({
        success: true,
        tipo: "CABELO",
        novoSaldo,
        atingiuLimite: novoSaldo === 0,
        mensagem: `Corte de cabelo registrado para ${row.nome}! Restam ${novoSaldo} cortes.`
      });
    }

    // AÇÃO 3: BAIXA DE BARBA
    if (tipo_servico === "BARBA") {
      const saldo = Number(row.barbas_restantes || 0);
      if (saldo <= 0) {
        return NextResponse.json({ error: `${row.nome} não possui serviços de barba restantes no plano!` }, { status: 400 });
      }

      const novoSaldo = saldo - 1;

      db.exec("BEGIN TRANSACTION;");
      emTransacao = true;

      db.prepare(`UPDATE mensalistas SET barbas_restantes = ? WHERE id = ?`).run(novoSaldo, mensalista_id);

      const histId = 'brb-' + Date.now();
      db.prepare(`
        INSERT INTO historico_cortes (id, mensalista_id, barbeiro_id, tipo_servico, observacao)
        VALUES (?, ?, ?, ?, ?)
      `).run(histId, mensalista_id, barbeiro_id || null, 'BARBA', observacao || "Baixa de Barba");

      db.exec("COMMIT;");
      emTransacao = false;

      return NextResponse.json({
        success: true,
        tipo: "BARBA",
        novoSaldo,
        atingiuLimite: novoSaldo === 0,
        mensagem: `Barba registrada para ${row.nome}! Restam ${novoSaldo} barbas.`
      });
    }

    // AÇÃO 4: BAIXA DE SOBRANCELHA
    if (tipo_servico === "SOBRANCELHA") {
      const saldo = Number(row.sobrancelhas_restantes || 0);
      if (saldo <= 0) {
        return NextResponse.json({ error: `${row.nome} não possui sobrancelha restante no plano!` }, { status: 400 });
      }

      const novoSaldo = saldo - 1;

      db.exec("BEGIN TRANSACTION;");
      emTransacao = true;

      db.prepare(`UPDATE mensalistas SET sobrancelhas_restantes = ? WHERE id = ?`).run(novoSaldo, mensalista_id);

      const histId = 'sob-' + Date.now();
      db.prepare(`
        INSERT INTO historico_cortes (id, mensalista_id, barbeiro_id, tipo_servico, observacao)
        VALUES (?, ?, ?, ?, ?)
      `).run(histId, mensalista_id, barbeiro_id || null, 'SOBRANCELHA', observacao || "Baixa de Sobrancelha");

      db.exec("COMMIT;");
      emTransacao = false;

      return NextResponse.json({
        success: true,
        tipo: "SOBRANCELHA",
        novoSaldo,
        mensagem: `Sobrancelha registrada para ${row.nome}!`
      });
    }

    return NextResponse.json({ error: "Tipo de serviço não especificado" }, { status: 400 });
  } catch (error: any) {
    if (emTransacao) {
      try { db.exec("ROLLBACK;"); } catch (e) {}
    }
    console.error("ERRO POST /api/mensalistas/baixa:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
