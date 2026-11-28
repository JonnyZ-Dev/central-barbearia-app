import { getDb } from "./db";

export interface ResultadoSyncBooksy {
  success: boolean;
  atualizados: number;
  inseridos: number;
  mantidos: number;
  planosAtualizados: number;
  totalOfertas: number;
  detalhes?: string[];
  erro?: string;
  timestamp: string;
}

const BOOKSY_URL_OFICIAL = "https://booksy.com/pt-br/264722_gmbarbershop_barbearias_1047773_sao-paulo";

// Helper para categorizar serviços com base no nome
export function categorizarServicoBooksy(nome: string): string {
  const n = nome.toLowerCase().trim();
  if (n.includes("semanal") || n.includes("mensal") || n.includes("plano")) {
    return "Planos";
  }
  if (
    n.includes(" e ") || 
    n.includes("+") || 
    n.includes("combo") ||
    (n.includes("corte") && (
      n.includes("barba") || 
      n.includes("sobrancelha") || 
      n.includes("quimica") || 
      n.includes("luzes") || 
      n.includes("relaxamento") || 
      n.includes("progressiva") || 
      n.includes("botox") || 
      n.includes("hidratacao") || 
      n.includes("hidratação") || 
      n.includes("platinado") || 
      n.includes("freestyle") || 
      n.includes("coloracao") || 
      n.includes("coloração") || 
      n.includes("selagem")
    )) ||
    (n.includes("barba") && (n.includes("pezinho") || n.includes("hidratada")))
  ) {
    return "Combos";
  }
  if (n.includes("barba")) {
    return "Barba";
  }
  if (
    n.includes("corte") || 
    n.includes("penteado") || 
    n.includes("luzes") || 
    n.includes("platinado") || 
    n.includes("progressiva") || 
    n.includes("botox") || 
    n.includes("selagem") || 
    n.includes("sobrancelha") || 
    n.includes("relaxamento") || 
    n.includes("coloração") || 
    n.includes("coloracao") || 
    n.includes("hidratação") || 
    n.includes("hidratacao") || 
    n.includes("freestyle")
  ) {
    return "Cabelo";
  }
  return "Outros";
}

// Normalizador de texto para comparar sem acentos e espaços extras
export function normalizarNomeServico(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\+/g, " e ")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Função principal de sincronização com o Booksy
 * Acessa a página pública do salão no Booksy, extrai os serviços e preços reais do JSON-LD Schema
 * e atualiza o banco de dados SQLite automaticamente.
 */
export async function sincronizarServicosBooksy(forcar: boolean = false): Promise<ResultadoSyncBooksy> {
  const agoraStr = new Date().toISOString();
  console.log(`[SYNC BOOKSY] Iniciando checagem de preços no Booksy (${agoraStr})...`);

  try {
    const db = getDb();

    // Obtém URL do Booksy cadastrada nas configurações
    let targetUrl = BOOKSY_URL_OFICIAL;
    try {
      const config: any = db.prepare("SELECT link_booksy FROM configuracoes WHERE id = 'default'").get();
      if (config?.link_booksy && config.link_booksy.includes("booksy.com/pt-br/")) {
        targetUrl = config.link_booksy.trim();
      } else {
        // Se a URL salva for apenas a home genérica, atualiza para o link oficial da GM Barbershop
        db.prepare("UPDATE configuracoes SET link_booksy = ? WHERE id = 'default'").run(BOOKSY_URL_OFICIAL);
      }
    } catch (e) {}

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9"
      }
    });

    if (!response.ok) {
      throw new Error(`Booksy retornou status HTTP ${response.status}`);
    }

    const html = await response.text();
    const jsonLdMatches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];

    let offers: any[] = [];
    let openingHoursSpecs: any[] = [];
    for (const match of jsonLdMatches) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.makesOffer && Array.isArray(parsed.makesOffer) && parsed.makesOffer.length > 0) {
          offers = parsed.makesOffer;
        }
        if (parsed.openingHoursSpecification && Array.isArray(parsed.openingHoursSpecification)) {
          openingHoursSpecs = parsed.openingHoursSpecification;
        }
      } catch (errJson) {}
    }

    // Se encontrou horários no Booksy, sincroniza automaticamente com as configurações da barbearia
    if (openingHoursSpecs.length > 0) {
      try {
        const diaMap: Record<string, string> = {
          Monday: "Segunda",
          Tuesday: "Terça",
          Wednesday: "Quarta",
          Thursday: "Quinta",
          Friday: "Sexta",
          Saturday: "Sábado",
          Sunday: "Domingo"
        };
        const partes = openingHoursSpecs.map(s => {
          const dias = (Array.isArray(s.dayOfWeek) ? s.dayOfWeek : [s.dayOfWeek]).map((d: string) => diaMap[d] || d);
          const diasTexto = dias.length === 1 ? dias[0] : (dias.length === 3 && dias[0] === "Terça" && dias[2] === "Quinta") ? "Terça a Quinta" : (dias.length === 2 && dias[0] === "Sexta" && dias[1] === "Sábado") ? "Sexta e Sábado" : dias.join(", ");
          return `${diasTexto} das ${String(s.opens || "").replace(":00", "h")} às ${String(s.closes || "").replace(":00", "h")}`;
        });
        partes.push("Domingo fechado");
        const horarioTextoFinal = partes.join(" | ");
        db.prepare("UPDATE configuracoes SET horario_funcionamento = ? WHERE id = 'default'").run(horarioTextoFinal);
        console.log(`[BOOKSY SYNC] Horário de funcionamento sincronizado do Booksy: "${horarioTextoFinal}"`);
      } catch (errHorario: any) {
        console.warn(`[BOOKSY SYNC] Não foi possível atualizar horário: ${errHorario.message}`);
      }
    }

    if (offers.length === 0) {
      throw new Error("Não foi possível extrair a lista de serviços (makesOffer) da página do Booksy.");
    }

    const servicosExistentes: any[] = db.prepare("SELECT * FROM servicos").all() || [];
    const planosExistentes: any[] = db.prepare("SELECT * FROM planos").all() || [];

    let atualizados = 0;
    let inseridos = 0;
    let mantidos = 0;
    let planosAtualizados = 0;
    const detalhes: string[] = [];

    // Preparar statements do SQLite
    const stmtUpdateServico = db.prepare("UPDATE servicos SET preco = ?, ativo = 1 WHERE id = ?");
    const stmtInsertServico = db.prepare(`
      INSERT INTO servicos (id, nome, categoria, preco, preco_a_partir_de, duracao_minutos, descricao, ativo)
      VALUES (?, ?, ?, ?, 0, ?, ?, 1)
    `);
    const stmtUpdatePlano = db.prepare("UPDATE planos SET preco_mensal = ?, ativo = 1 WHERE id = ?");

    for (const offer of offers) {
      const nomeOriginal = String(offer.name || "").trim();
      const preco = Number(offer.price);
      if (!nomeOriginal || isNaN(preco)) continue;

      const categoria = categorizarServicoBooksy(nomeOriginal);

      // Tratamento especial para Planos VIP de Assinatura
      if (categoria === "Planos") {
        const nPlano = normalizarNomeServico(nomeOriginal);
        if (nPlano.includes("barba")) {
          const planoVip = planosExistentes.find(p => p.id === "plano-vip-completo" || normalizarNomeServico(p.nome).includes("barba"));
          if (planoVip && Number(planoVip.preco_mensal) !== preco) {
            stmtUpdatePlano.run(preco, planoVip.id);
            detalhes.push(`Plano VIP ${planoVip.nome}: R$ ${planoVip.preco_mensal} -> R$ ${preco}`);
            planosAtualizados++;
          }
        } else {
          const planoCorte = planosExistentes.find(p => p.id === "plano-corte-semanal-gm" || normalizarNomeServico(p.nome).includes("corte"));
          if (planoCorte && Number(planoCorte.preco_mensal) !== preco) {
            stmtUpdatePlano.run(preco, planoCorte.id);
            detalhes.push(`Plano ${planoCorte.nome}: R$ ${planoCorte.preco_mensal} -> R$ ${preco}`);
            planosAtualizados++;
          }
        }
        continue;
      }

      // Procura se o serviço já existe no SQLite
      const nomeNorm = normalizarNomeServico(nomeOriginal);
      const existente = servicosExistentes.find(s => normalizarNomeServico(s.nome) === nomeNorm);

      if (existente) {
        if (Number(existente.preco) !== preco) {
          stmtUpdateServico.run(preco, existente.id);
          detalhes.push(`Preço atualizado: ${existente.nome} (de R$ ${existente.preco} para R$ ${preco})`);
          console.log(`[SYNC BOOKSY] ${existente.nome}: R$ ${existente.preco} -> R$ ${preco}`);
          atualizados++;
        } else {
          mantidos++;
        }
      } else {
        // Novo serviço cadastrado no Booksy que ainda não existia no banco
        const baseSlug = "serv-" + nomeNorm.replace(/\s+/g, "-");
        let idFinal = baseSlug;
        let counter = 1;
        while (
          servicosExistentes.some(s => s.id === idFinal) || 
          db.prepare("SELECT 1 FROM servicos WHERE id = ?").get(idFinal)
        ) {
          idFinal = `${baseSlug}-${counter++}`;
        }
        const duracao = categoria === "Combos" ? 90 : (categoria === "Barba" ? 40 : 50);
        const descricao = `Serviço oficial ${nomeOriginal} integrado do Booksy.`;

        stmtInsertServico.run(idFinal, nomeOriginal, categoria, preco, duracao, descricao);
        servicosExistentes.push({ id: idFinal, nome: nomeOriginal, preco });
        detalhes.push(`Novo serviço inserido: ${nomeOriginal} (R$ ${preco}, Categoria: ${categoria})`);
        console.log(`[SYNC BOOKSY] Novo serviço inserido: ${nomeOriginal} (${categoria}) - R$ ${preco}`);
        inseridos++;
      }
    }

    console.log(`[SYNC BOOKSY] Concluído com sucesso! Atualizados: ${atualizados}, Novos: ${inseridos}, Mantidos: ${mantidos}, Planos: ${planosAtualizados}`);

    return {
      success: true,
      atualizados,
      inseridos,
      mantidos,
      planosAtualizados,
      totalOfertas: offers.length,
      detalhes,
      timestamp: agoraStr
    };
  } catch (error: any) {
    console.error("[SYNC BOOKSY] Erro durante sincronização:", error.message);
    return {
      success: false,
      atualizados: 0,
      inseridos: 0,
      mantidos: 0,
      planosAtualizados: 0,
      totalOfertas: 0,
      erro: error.message,
      timestamp: agoraStr
    };
  }
}

/**
 * Agendador Automático Diário:
 * Executa uma sincronização 15 segundos após o boot do sistema,
 * e a partir de então roda automaticamente uma vez a cada 24 horas (sem intervenção humana).
 */
export function iniciarAgendadorSincronizacaoBooksy() {
  if ((global as any).__booksySyncInterval) {
    return;
  }

  console.log("[SYNC BOOKSY] Agendador diário automático registrado (execução a cada 24 horas).");

  // Execução inicial 12 segundos após subir o servidor
  setTimeout(() => {
    sincronizarServicosBooksy().catch(err => {
      console.warn("[SYNC BOOKSY] Falha na sincronização inicial:", err.message);
    });
  }, 12000);

  // Intervalo recorrente de 24 horas (86.400.000 ms)
  (global as any).__booksySyncInterval = setInterval(() => {
    console.log("[SYNC BOOKSY] Disparando rotina diária automática de atualização de preços...");
    sincronizarServicosBooksy().catch(err => {
      console.warn("[SYNC BOOKSY] Falha na rotina diária automática:", err.message);
    });
  }, 24 * 60 * 60 * 1000);
}
