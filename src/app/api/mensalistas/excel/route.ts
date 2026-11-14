import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { formatarTelefoneBR, validarTelefoneBR } from "@/lib/formatters";
import * as XLSX from "xlsx";

function normalizarCampo(row: any, ...chaves: string[]): any {
  for (const k of Object.keys(row)) {
    const cleanKey = k.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    for (const c of chaves) {
      const cleanChave = c.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      if (cleanKey === cleanChave) {
        return row[k];
      }
    }
  }
  return undefined;
}

function parseDataExcel(val: any, defaultOffsetDias: number = 30): string {
  if (!val || String(val).trim() === "") {
    const d = new Date();
    d.setDate(d.getDate() + defaultOffsetDias);
    return d.toISOString().split("T")[0];
  }

  // Se for número serial do Excel
  if (typeof val === "number") {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return date.toISOString().split("T")[0];
  }

  const s = String(val).trim();
  // Formato brasileiro DD/MM/AAAA ou DD-MM-AAAA
  const matchBR = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (matchBR) {
    const dia = matchBR[1].padStart(2, "0");
    const mes = matchBR[2].padStart(2, "0");
    const ano = matchBR[3];
    return `${ano}-${mes}-${dia}`;
  }

  // Formato ISO AAAA-MM-DD
  const matchISO = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (matchISO) {
    const ano = matchISO[1];
    const mes = matchISO[2].padStart(2, "0");
    const dia = matchISO[3].padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }

  return s;
}

// GET: Exportar clientes atuais ou baixar modelo em branco (.xlsx)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get("tipo") || "exportar";
    const db = getDb();

    const planos = db.prepare("SELECT * FROM planos WHERE ativo = 1").all() as any[];
    const planoPadrao = planos[0]?.nome || "Corte Semanal GM";
    const precoPadrao = planos[0]?.preco_mensal || 130;

    if (tipo === "modelo") {
      // PLANILHA MODELO / TEMPLATE OFICIAL
      const hoje = new Date().toISOString().split("T")[0];
      const daqui30dias = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split("T")[0];

      const linhasModelo = [
        {
          "Nome": "Lucas Silva (Exemplo)",
          "WhatsApp": "(11) 98888-1111",
          "Plano": planoPadrao,
          "Cortes Restantes": 4,
          "Barbas Restantes": 0,
          "Sobrancelhas Restantes": 0,
          "Valor Pago (R$)": precoPadrao,
          "Data Início": hoje,
          "Data Vencimento": daqui30dias,
          "Status": "ATIVO",
          "Observações": "Exemplo: Cliente VIP que corta toda semana"
        },
        {
          "Nome": "Carlos Eduardo (Exemplo)",
          "WhatsApp": "(11) 97777-2222",
          "Plano": planoPadrao,
          "Cortes Restantes": 2,
          "Barbas Restantes": 0,
          "Sobrancelhas Restantes": 0,
          "Valor Pago (R$)": precoPadrao,
          "Data Início": hoje,
          "Data Vencimento": daqui30dias,
          "Status": "ATIVO",
          "Observações": "Já realizou 2 cortes neste ciclo"
        }
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(linhasModelo);

      // Definir larguras de coluna para ficar bonito no Excel
      ws["!cols"] = [
        { wch: 26 }, // Nome
        { wch: 18 }, // WhatsApp
        { wch: 22 }, // Plano
        { wch: 16 }, // Cortes Restantes
        { wch: 16 }, // Barbas Restantes
        { wch: 20 }, // Sobrancelhas Restantes
        { wch: 16 }, // Valor Pago
        { wch: 14 }, // Data Início
        { wch: 16 }, // Data Vencimento
        { wch: 10 }, // Status
        { wch: 38 }  // Observações
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Modelo Clientes VIP");
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="modelo_clientes_vip_gm.xlsx"'
        }
      });
    }

    // EXPORTAÇÃO REAL DA BASE DE CLIENTES ATUAL
    const mensalistas = db.prepare(`
      SELECT m.*, p.nome as plano_nome 
      FROM mensalistas m 
      LEFT JOIN planos p ON m.plano_id = p.id 
      ORDER BY m.nome ASC
    `).all() as any[];

    const linhasExport: any[] = mensalistas.map((m) => ({
      "Nome": m.nome,
      "WhatsApp": m.whatsapp,
      "Plano": m.plano_nome || planoPadrao,
      "Cortes Restantes": Number(m.cortes_restantes ?? 0),
      "Barbas Restantes": Number(m.barbas_restantes ?? 0),
      "Sobrancelhas Restantes": Number(m.sobrancelhas_restantes ?? 0),
      "Valor Pago (R$)": Number(m.valor_pago ?? precoPadrao),
      "Data Início": m.data_inicio || "",
      "Data Vencimento": m.data_vencimento || "",
      "Status": m.status || "ATIVO",
      "Observações": m.observacoes || ""
    }));

    // Se estiver vazio, gera pelo menos cabeçalhos limpos com 1 linha de exemplo
    if (linhasExport.length === 0) {
      linhasExport.push({
        "Nome": "Sem clientes cadastrados ainda",
        "WhatsApp": "(11) 99999-9999",
        "Plano": planoPadrao,
        "Cortes Restantes": 4,
        "Barbas Restantes": 0,
        "Sobrancelhas Restantes": 0,
        "Valor Pago (R$)": precoPadrao,
        "Data Início": new Date().toISOString().split("T")[0],
        "Data Vencimento": new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split("T")[0],
        "Status": "ATIVO",
        "Observações": "Preencha com seus clientes e envie de volta"
      });
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(linhasExport);

    ws["!cols"] = [
      { wch: 26 }, // Nome
      { wch: 18 }, // WhatsApp
      { wch: 22 }, // Plano
      { wch: 16 }, // Cortes Restantes
      { wch: 16 }, // Barbas Restantes
      { wch: 20 }, // Sobrancelhas Restantes
      { wch: 16 }, // Valor Pago
      { wch: 14 }, // Data Início
      { wch: 16 }, // Data Vencimento
      { wch: 10 }, // Status
      { wch: 38 }  // Observações
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Clientes VIPs");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const dataHojeFormatada = new Date().toISOString().split("T")[0];

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="clientes_vips_gm_${dataHojeFormatada}.xlsx"`
      }
    });

  } catch (error: any) {
    console.error("[EXCEL EXPORT] Erro:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Importar clientes via Excel (.xlsx, .xls ou .csv) com Upsert Inteligente
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado!" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(buffer, { type: "buffer" });
    } catch (e) {
      return NextResponse.json({ error: "Arquivo corrompido ou formato inválido. Envie um arquivo .xlsx, .xls ou .csv." }, { status: 400 });
    }

    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ error: "A planilha está vazia." }, { status: 400 });
    }

    const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" }) as any[];

    if (!rawRows || rawRows.length === 0) {
      return NextResponse.json({ error: "Nenhuma linha encontrada na planilha enviada." }, { status: 400 });
    }

    const db = getDb();
    const planos = db.prepare("SELECT * FROM planos WHERE ativo = 1").all() as any[];
    const planoPadrao = planos[0] || { id: "plano-corte-semanal-gm", nome: "Corte Semanal GM", preco_mensal: 130, cortes_cabelo_inclusos: 4, barbas_inclusas: 0 };

    let novos = 0;
    let atualizados = 0;
    const erros: Array<{ linha: number; nome?: string; motivo: string }> = [];

    const stmtCheck = db.prepare(`
      SELECT id, nome, whatsapp, cortes_restantes, barbas_restantes, status 
      FROM mensalistas 
      WHERE whatsapp = ? 
         OR REPLACE(REPLACE(REPLACE(REPLACE(whatsapp, '(', ''), ')', ''), '-', ''), ' ', '') = ?
         OR REPLACE(REPLACE(REPLACE(REPLACE(whatsapp, '(', ''), ')', ''), '-', ''), ' ', '') = ?
    `);

    const stmtUpdate = db.prepare(`
      UPDATE mensalistas SET
        nome = ?,
        plano_id = ?,
        valor_pago = ?,
        cortes_restantes = ?,
        barbas_restantes = ?,
        sobrancelhas_restantes = ?,
        data_inicio = ?,
        data_vencimento = ?,
        status = ?,
        observacoes = ?
      WHERE id = ?
    `);

    const stmtInsert = db.prepare(`
      INSERT INTO mensalistas (
        id, nome, whatsapp, plano_id, valor_pago,
        cortes_restantes, barbas_restantes, sobrancelhas_restantes,
        data_inicio, data_vencimento, status, observacoes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const numeroLinha = i + 2; // Linha 1 no Excel é cabeçalho

      const nomeRaw = normalizarCampo(row, "nome", "cliente", "nome do cliente");
      const whatsRaw = normalizarCampo(row, "whatsapp", "telefone", "celular", "contato");

      // Pular linhas vazias
      if (!nomeRaw && !whatsRaw) continue;

      const nome = String(nomeRaw || "").trim();
      if (!nome) {
        erros.push({ linha: numeroLinha, motivo: "Nome do cliente está em branco" });
        continue;
      }

      // Validar e formatar telefone
      let digitosWhats = String(whatsRaw || "").replace(/\D/g, "");
      if (digitosWhats.startsWith("55") && (digitosWhats.length === 12 || digitosWhats.length === 13)) {
        digitosWhats = digitosWhats.slice(2);
      }

      if (!validarTelefoneBR(digitosWhats)) {
        erros.push({ linha: numeroLinha, nome, motivo: `WhatsApp inválido: '${whatsRaw}' (precisa ter DDD + 8 ou 9 dígitos)` });
        continue;
      }

      const whatsappFormatado = formatarTelefoneBR(digitosWhats);

      // Identificar Plano
      const planoStr = normalizarCampo(row, "plano", "plano vip", "nome do plano");
      let planoEscolhido = planoPadrao;
      if (planoStr) {
        const planoStrLimpo = String(planoStr).toLowerCase().trim();
        const achou = planos.find((p: any) => 
          p.nome.toLowerCase().includes(planoStrLimpo) || 
          planoStrLimpo.includes(p.nome.toLowerCase()) ||
          p.id.toLowerCase() === planoStrLimpo
        );
        if (achou) planoEscolhido = achou;
      }

      // Saldo de cortes
      const cortesRaw = normalizarCampo(row, "cortes restantes", "cortes", "saldo cortes", "saldo");
      let cortesRestantes = planoEscolhido.cortes_cabelo_inclusos ?? 4;
      if (cortesRaw !== undefined && cortesRaw !== null && String(cortesRaw).trim() !== "") {
        const num = parseInt(String(cortesRaw), 10);
        if (!isNaN(num)) cortesRestantes = Math.max(0, num);
      }

      // Saldo de barbas
      const barbasRaw = normalizarCampo(row, "barbas restantes", "barbas", "saldo barbas");
      let barbasRestantes = planoEscolhido.barbas_inclusas ?? 0;
      if (barbasRaw !== undefined && barbasRaw !== null && String(barbasRaw).trim() !== "") {
        const num = parseInt(String(barbasRaw), 10);
        if (!isNaN(num)) barbasRestantes = Math.max(0, num);
      }

      // Saldo de sobrancelhas
      const sobRaw = normalizarCampo(row, "sobrancelhas restantes", "sobrancelhas", "sobrancelha");
      let sobRestantes = 0;
      if (sobRaw !== undefined && sobRaw !== null && String(sobRaw).trim() !== "") {
        const num = parseInt(String(sobRaw), 10);
        if (!isNaN(num)) sobRestantes = Math.max(0, num);
      }

      // Valor pago
      const valorRaw = normalizarCampo(row, "valor pago", "valor", "preco", "preço");
      let valorPago = planoEscolhido.preco_mensal ?? 130;
      if (valorRaw !== undefined && valorRaw !== null && String(valorRaw).trim() !== "") {
        const num = parseFloat(String(valorRaw).replace(",", "."));
        if (!isNaN(num)) valorPago = Math.max(0, num);
      }

      // Datas
      const inicioRaw = normalizarCampo(row, "data inicio", "data de inicio", "inicio");
      const vencRaw = normalizarCampo(row, "data vencimento", "data de vencimento", "vencimento");

      const dataInicio = parseDataExcel(inicioRaw, 0);
      const dataVencimento = parseDataExcel(vencRaw, 30);

      // Status
      const statusRaw = normalizarCampo(row, "status", "situacao");
      const status = String(statusRaw || "ATIVO").toUpperCase().includes("INATIVO") ? "INATIVO" : "ATIVO";

      // Observações
      const obsRaw = normalizarCampo(row, "observacoes", "observacao", "obs");
      const observacoes = String(obsRaw || "").trim();

      // VERIFICAR SE O CLIENTE JÁ EXISTE NO SISTEMA (Pelo WhatsApp)
      const existente: any = stmtCheck.get(
        whatsappFormatado,
        digitosWhats,
        `55${digitosWhats}`
      );

      if (existente) {
        // CLIENTE EXISTENTE: ATUALIZAR DADOS
        stmtUpdate.run(
          nome,
          planoEscolhido.id,
          valorPago,
          cortesRestantes,
          barbasRestantes,
          sobRestantes,
          dataInicio,
          dataVencimento,
          status,
          observacoes || existente.observacoes || "",
          existente.id
        );
        atualizados++;
      } else {
        // NOVO CLIENTE: CADASTRAR COM NOVO ID
        const novoId = `mensalista_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        stmtInsert.run(
          novoId,
          nome,
          whatsappFormatado,
          planoEscolhido.id,
          valorPago,
          cortesRestantes,
          barbasRestantes,
          sobRestantes,
          dataInicio,
          dataVencimento,
          status,
          observacoes
        );
        novos++;
      }
    }

    return NextResponse.json({
      success: true,
      novos,
      atualizados,
      totalProcessados: novos + atualizados,
      erros,
      message: `Importação finalizada! ${novos} novos clientes cadastrados e ${atualizados} clientes atualizados.`
    });

  } catch (error: any) {
    console.error("[EXCEL IMPORT] Erro:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
