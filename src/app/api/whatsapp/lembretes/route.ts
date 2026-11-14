import { NextResponse } from "next/server";
import { processarAvisosRenovacaoAutomatica } from "@/lib/whatsapp-bot";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const db = getDb();
    const config = db.prepare("SELECT * FROM configuracoes WHERE id = 'default'").get() as any || {};
    const diasAntecedencia = Number(config.dias_aviso_renovacao ?? 3);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const mensalistas: any[] = db.prepare(`
      SELECT m.*, p.nome as plano_nome 
      FROM mensalistas m 
      LEFT JOIN planos p ON m.plano_id = p.id 
      WHERE m.status = 'ATIVO' AND m.data_vencimento IS NOT NULL
    `).all() || [];

    const clientesNaJanela = mensalistas.map((m: any) => {
      const parts = String(m.data_vencimento).split("-").map(Number);
      if (parts.length !== 3) return null;
      const dataVenc = new Date(parts[0], parts[1] - 1, parts[2]);
      dataVenc.setHours(0, 0, 0, 0);
      const diffDias = Math.round((dataVenc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: m.id,
        nome: m.nome,
        whatsapp: m.whatsapp,
        plano_nome: m.plano_nome,
        data_vencimento: m.data_vencimento,
        dias_restantes: diffDias,
        ultimo_aviso: m.ultimo_aviso_renovacao,
        dentroDaJanela: diffDias <= diasAntecedencia && diffDias >= 0
      };
    }).filter(Boolean);

    return NextResponse.json({
      dias_configurados: diasAntecedencia,
      ativo: Boolean(config.aviso_renovacao_ativo !== 0),
      total_ativos: mensalistas.length,
      clientes: clientesNaJanela
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const resultado = await processarAvisosRenovacaoAutomatica();
    return NextResponse.json({ success: true, ...resultado });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
