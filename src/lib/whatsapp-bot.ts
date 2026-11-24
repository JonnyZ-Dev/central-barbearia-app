import path from "path";
import fs from "fs";
import QRCode from "qrcode";
import pino from "pino";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import { NodeCache } from "@cacheable/node-cache";
import { getDb } from "./db";
import { gerarRespostaGemini, limparHistoricoChat } from "./gemini";

const AUTH_DIR = path.join(process.cwd(), "database", "auth_info_baileys");

let sock: any = null;
let currentQr: string | null = null;
let connectionStatus: "DESCONECTADO" | "AGUARDANDO_QR" | "CONECTADO" = "DESCONECTADO";
let connectedNumber: string | null = null;
let isConnecting = false;

// Controle de concorrência e deduplicação absoluta de mensagens (anti-spam / anti-loop)
const mensagensProcessadas = new Set<string>();

interface MensagemBufferizada {
  texto: string;
  ehAudio: boolean;
  ehImagem: boolean;
  pushName?: string;
  senderPn?: string;
  participantPn?: string;
}

interface ChatBufferState {
  mensagens: MensagemBufferizada[];
  timer: NodeJS.Timeout | null;
  processando: boolean;
}

// Fila e buffer inteligente com debounce por chat (agrupa mensagens consecutivas e nunca descarta)
const chatBuffers = new Map<string, ChatBufferState>();

// Cache em memória para resolução instantânea de LID para Telefone real
const lidToPhoneMap = new Map<string, string>();

// Controle de mensagens enviadas pelo próprio robô (para diferenciar de mensagens enviadas por humanos no celular)
const mensagensEnviadasPeloRobo = new Set<string>();

// Cache oficial para retries do Baileys persistente na RAM (sobrevive a reconexões do socket)
const msgRetryCounterCache = new NodeCache({ stdTTL: 3600, useClones: false }) as any;
const placeholderResendCache = new NodeCache({ stdTTL: 3600, useClones: false }) as any;

// Cache em memória e SQLite de mensagens para responder instantaneamente a retries de criptografia do WhatsApp
const mensagensCacheStore = new Map<string, any>();

function salvarMensagemNoCache(id: string, remoteJid: string | undefined, message: any) {
  if (!id || !message) return;
  try {
    const rawMsg = message?.message || message;
    mensagensCacheStore.set(id, rawMsg);
    if (remoteJid) {
      mensagensCacheStore.set(`${remoteJid}:${id}`, rawMsg);
    }
    if (mensagensCacheStore.size > 2000) {
      const firstKey = mensagensCacheStore.keys().next().value;
      if (firstKey) mensagensCacheStore.delete(firstKey);
    }

    try {
      const db = getDb();
      db.prepare(`
        INSERT OR REPLACE INTO bot_mensagens_cache (id, remote_jid, message_json, criado_em)
        VALUES (?, ?, ?, ?)
      `).run(id, remoteJid || "", JSON.stringify(rawMsg), Date.now());

      if (Math.random() < 0.02) {
        db.prepare(`
          DELETE FROM bot_mensagens_cache 
          WHERE id NOT IN (
            SELECT id FROM bot_mensagens_cache ORDER BY criado_em DESC LIMIT 1000
          )
        `).run();
      }
    } catch (e) {}
  } catch (err) {}
}

async function recuperarMensagemDoCache(key: any): Promise<any> {
  if (!key?.id) return undefined;
  const id = key.id;
  const remoteJid = key.remoteJid;

  // 1. Tenta recuperar da RAM pela chave composta
  if (remoteJid && mensagensCacheStore.has(`${remoteJid}:${id}`)) {
    const raw = mensagensCacheStore.get(`${remoteJid}:${id}`);
    return raw?.message || raw;
  }

  // 2. Tenta recuperar da RAM pelo ID simples
  if (mensagensCacheStore.has(id)) {
    const raw = mensagensCacheStore.get(id);
    return raw?.message || raw;
  }

  // 3. Se não achou na RAM, busca no SQLite persistente
  try {
    const db = getDb();
    const row: any = db.prepare("SELECT message_json FROM bot_mensagens_cache WHERE id = ?").get(id);
    if (row?.message_json) {
      const parsed = JSON.parse(row.message_json);
      mensagensCacheStore.set(id, parsed);
      return parsed?.message || parsed;
    }
  } catch (e) {}

  return undefined;
}

// Cache em memória de conversas em atendimento humano (robô em pausa)
const atendimentosHumanosCache = new Map<string, {
  numero: string;
  nome: string;
  motivo: string;
  iniciadoEm: string;
  expiraEm: number;
}>();

// Helper que valida comandos que o cliente usa para reativar o robô e trazer o menu
// Helper que valida comandos e palavras-chave que reativam o robô quando em atendimento humano
function ehComandoReativarBot(texto: string): boolean {
  const t = (texto || "").trim().toLowerCase();
  if (!t) return false;

  // Normalizar removendo pontuações como vírgulas, exclamações, etc.
  const limpo = t.replace(/[!?,.;:\-_]/g, " ").replace(/\s+/g, " ").trim();

  const comandos = [
    "#sair", "sair", "#cancelar", "cancelar",
    "#menu", "menu", "#opcoes", "#opções", "opcoes", "opções", "#ajuda", "ajuda",
    "#ativar", "ativar", "#reativar", "reativar", "#bot",
    "início", "inicio", "voltar", "voltar ao menu", "0", 
    "#voltar", "comecar", "começar"
  ];

  if (comandos.includes(t) || comandos.includes(limpo)) {
    return true;
  }

  // Qualquer saudação (mesmo com pontuação ou combinada: "oi", "oi boa noite", "ola tudo bem")
  if (
    /\b(oi|ola|olá|oie|opa|salve|fala|eai|e ai|bom dia|boa tarde|boa noite|tudo bem|td bem)\b/.test(limpo) ||
    limpo.startsWith("oi") ||
    limpo.startsWith("ola") ||
    limpo.startsWith("olá")
  ) {
    return true;
  }

  if (
    limpo.includes("agendar") ||
    limpo.includes("marcar") ||
    limpo.includes("horario") ||
    limpo.includes("horário") ||
    limpo.includes("vaga") ||
    limpo.includes("booksy") ||
    limpo.includes("preco") ||
    limpo.includes("preço") ||
    limpo.includes("quanto custa") ||
    limpo.includes("valor") ||
    limpo.includes("tabela") ||
    limpo.includes("onde fica") ||
    limpo.includes("endereco") ||
    limpo.includes("endereço") ||
    limpo.includes("como chegar") ||
    limpo.includes("pix") ||
    limpo.includes("pagamento") ||
    limpo.includes("cartao") ||
    limpo.includes("cartão") ||
    limpo.includes("plano") ||
    limpo.includes("mensalista") ||
    limpo.includes("assinatura")
  ) {
    return true;
  }
  return false;
}

// Helper oficial de envio do robô que cataloga o ID da mensagem para evitar auto-interferência e retries
async function enviarMensagemDoBot(jid: string, content: any) {
  if (!sock) return null;
  const sent = await sock.sendMessage(jid, content);
  if (sent?.key?.id) {
    mensagensEnviadasPeloRobo.add(sent.key.id);
    if (mensagensEnviadasPeloRobo.size > 2000) {
      const first = mensagensEnviadasPeloRobo.values().next().value;
      if (first) mensagensEnviadasPeloRobo.delete(first);
    }

    // Salva a mensagem enviada no cache para resposta imediata ao retry de criptografia do WhatsApp
    const msgParaSalvar = sent.message || (content?.text ? { conversation: content.text } : content);
    salvarMensagemNoCache(sent.key.id, sent.key.remoteJid || jid, msgParaSalvar);
  }
  return sent;
}

export function carregarAtendimentosDoBanco() {
  try {
    const db = getDb();
    const agora = Date.now();
    try {
      db.prepare("DELETE FROM atendimentos_humanos WHERE expira_em < ?").run(agora);
    } catch (e) {}
    const rows: any[] = db.prepare("SELECT * FROM atendimentos_humanos WHERE expira_em >= ?").all(agora) || [];
    atendimentosHumanosCache.clear();
    for (const r of rows) {
      atendimentosHumanosCache.set(r.remote_jid, {
        numero: r.numero || "",
        nome: r.nome || "",
        motivo: r.motivo || "",
        iniciadoEm: r.iniciado_em || "",
        expiraEm: Number(r.expira_em)
      });
    }
    console.log(`[ATENDIMENTO HUMANO] ${atendimentosHumanosCache.size} atendimentos humanos carregados.`);
  } catch (e) {
    console.error("Erro ao carregar atendimentos do banco:", e);
  }
}

export function ativarPausaAtendimentoHumano(
  remoteJid: string,
  motivo: string,
  nome?: string,
  numero?: string
) {
  try {
    const db = getDb();
    const config: any = db.prepare("SELECT tempo_pausa_humano_minutos FROM configuracoes WHERE id = 'default'").get() || {};
    const minutosPausa = Number(config.tempo_pausa_humano_minutos || 120); // 120 minutos (2 horas) por padrão
    const agora = Date.now();
    const expiraEm = agora + (minutosPausa * 60 * 1000);
    const iniciadoEm = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    const numFormatado = numero || remoteJid.replace(/[^0-9]/g, "");
    const nomeFormatado = nome || "";

    atendimentosHumanosCache.set(remoteJid, {
      numero: numFormatado,
      nome: nomeFormatado,
      motivo,
      iniciadoEm,
      expiraEm
    });

    db.prepare(`
      INSERT INTO atendimentos_humanos (remote_jid, numero, nome, motivo, iniciado_em, expira_em)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(remote_jid) DO UPDATE SET
        motivo = excluded.motivo,
        expira_em = excluded.expira_em
    `).run(remoteJid, numFormatado, nomeFormatado, motivo, iniciadoEm, expiraEm);

    console.log(`[PAUSA ROBÔ] Robô pausado para ${remoteJid} por ${minutosPausa} min. Motivo: ${motivo}`);
  } catch (e) {
    console.error("Erro ao ativar pausa de atendimento humano:", e);
  }
}

export function verificarAtendimentoHumanoAtivo(remoteJid: string): boolean {
  const item = atendimentosHumanosCache.get(remoteJid);
  if (!item) return false;

  const agora = Date.now();
  if (agora > item.expiraEm) {
    atendimentosHumanosCache.delete(remoteJid);
    try {
      getDb().prepare("DELETE FROM atendimentos_humanos WHERE remote_jid = ?").run(remoteJid);
    } catch (e) {}
    return false;
  }

  return true;
}

export function removerPausaAtendimentoHumano(remoteJid: string) {
  atendimentosHumanosCache.delete(remoteJid);
  try {
    getDb().prepare("DELETE FROM atendimentos_humanos WHERE remote_jid = ?").run(remoteJid);
    console.log(`[PAUSA ROBÔ] Robô reativado para ${remoteJid}`);
  } catch (e) {}
}

export function listarAtendimentosHumanos() {
  const agora = Date.now();
  const lista: any[] = [];
  for (const [jid, val] of atendimentosHumanosCache.entries()) {
    if (agora <= val.expiraEm) {
      const minutosRestantes = Math.round((val.expiraEm - agora) / 60000);
      lista.push({
        remote_jid: jid,
        numero: val.numero,
        nome: val.nome,
        motivo: val.motivo,
        iniciado_em: val.iniciadoEm,
        minutos_restantes: minutosRestantes
      });
    } else {
      atendimentosHumanosCache.delete(jid);
    }
  }
  return lista;
}

/**
 * Sincroniza ativamente todos os mensalistas cadastrados com o WhatsApp
 * Descobre e vincula os LIDs (Identificadores Multi-Dispositivo) dos clientes
 */
export async function sincronizarLidsMensalistas() {
  if (!sock || connectionStatus !== "CONECTADO") return;
  try {
    const db = getDb();
    const mensalistas: any[] = db.prepare("SELECT id, nome, whatsapp, whatsapp_lid FROM mensalistas WHERE status = 'ATIVO'").all() || [];

    for (const m of mensalistas) {
      const telDigitos = String(m.whatsapp || "").replace(/\D/g, "");
      if (telDigitos.length < 8) continue;

      // Se já possui whatsapp_lid salvo no SQLite, alimenta o cache
      if (m.whatsapp_lid) {
        const lidLimpo = String(m.whatsapp_lid).replace(/\D/g, "");
        lidToPhoneMap.set(m.whatsapp_lid, telDigitos);
        lidToPhoneMap.set(lidLimpo, telDigitos);
      }

      // Se ainda não tem whatsapp_lid, consulta a API do WhatsApp (onWhatsApp)
      if (!m.whatsapp_lid && telDigitos.length >= 10) {
        const candidatos: string[] = [];
        let numBase = telDigitos;
        if (numBase.startsWith("55")) numBase = numBase.slice(2);

        if (numBase.length === 11) {
          const ddd = numBase.slice(0, 2);
          const resto = numBase.slice(2);
          candidatos.push(`+55${numBase}`);
          candidatos.push(`+55${ddd}${resto.slice(1)}`);
        } else if (numBase.length === 10) {
          const ddd = numBase.slice(0, 2);
          const resto = numBase.slice(2);
          candidatos.push(`+55${ddd}9${resto}`);
          candidatos.push(`+55${numBase}`);
        } else {
          candidatos.push(`+${telDigitos.startsWith("55") ? telDigitos : "55" + telDigitos}`);
        }

        try {
          const resultados = await sock.onWhatsApp(...candidatos);
          if (resultados && Array.isArray(resultados)) {
            for (const r of resultados) {
              if (r && r.lid) {
                const lidLimpo = String(r.lid).replace(/\D/g, "");
                lidToPhoneMap.set(r.lid, telDigitos);
                lidToPhoneMap.set(lidLimpo, telDigitos);
                db.prepare("UPDATE mensalistas SET whatsapp_lid = ? WHERE id = ?").run(r.lid, m.id);
                console.log(`[BOT SYNC] Mensalista ${m.nome} mapeado com sucesso: LID ${r.lid} <-> Tel ${telDigitos}`);
                break;
              }
            }
          }
        } catch (syncErr) {}
      }
    }
  } catch (err) {
    console.error("[BOT SYNC] Erro ao sincronizar LIDs:", err);
  }
}

export async function sincronizarLidParaMensalista(id: string) {
  if (!sock || connectionStatus !== "CONECTADO") return;
  try {
    const db = getDb();
    const m = db.prepare("SELECT * FROM mensalistas WHERE id = ?").get(id) as any;
    if (!m) return;
    const telDigitos = String(m.whatsapp || "").replace(/\D/g, "");
    if (telDigitos.length < 10) return;

    const candidatos: string[] = [];
    let numBase = telDigitos;
    if (numBase.startsWith("55")) numBase = numBase.slice(2);

    if (numBase.length === 11) {
      const ddd = numBase.slice(0, 2);
      const resto = numBase.slice(2);
      candidatos.push(`+55${numBase}`);
      candidatos.push(`+55${ddd}${resto.slice(1)}`);
    } else if (numBase.length === 10) {
      const ddd = numBase.slice(0, 2);
      const resto = numBase.slice(2);
      candidatos.push(`+55${ddd}9${resto}`);
      candidatos.push(`+55${numBase}`);
    } else {
      candidatos.push(`+${telDigitos.startsWith("55") ? telDigitos : "55" + telDigitos}`);
    }

    const resultados = await sock.onWhatsApp(...candidatos);
    if (resultados && Array.isArray(resultados)) {
      for (const r of resultados) {
        if (r && r.lid) {
          const lidLimpo = String(r.lid).replace(/\D/g, "");
          lidToPhoneMap.set(r.lid, telDigitos);
          lidToPhoneMap.set(lidLimpo, telDigitos);
          db.prepare("UPDATE mensalistas SET whatsapp_lid = ? WHERE id = ?").run(r.lid, m.id);
          console.log(`[BOT SYNC INDIVIDUAL] Mensalista ${m.nome} mapeado: LID ${r.lid} <-> Tel ${telDigitos}`);
          break;
        }
      }
    }
  } catch (e) {}
}

/**
 * Dispara automaticamente a mensagem oficial de fim de pacote (0 cortes restantes)
 */
export async function enviarAvisoUltimoCorte(mensalistaId: string) {
  if (!sock || connectionStatus !== "CONECTADO") return;
  try {
    const db = getDb();
    const config = db.prepare("SELECT * FROM configuracoes WHERE id = 'default'").get() as any || {};
    const m: any = db.prepare(`
      SELECT m.*, p.nome as plano_nome 
      FROM mensalistas m 
      LEFT JOIN planos p ON m.plano_id = p.id 
      WHERE m.id = ?
    `).get(mensalistaId);
    if (!m) return;

    let targetJid = m.whatsapp_lid;
    if (!targetJid || !targetJid.includes("@")) {
      const telDigitos = String(m.whatsapp || "").replace(/\D/g, "");
      if (telDigitos.length < 10) return;
      const comDDI = telDigitos.startsWith("55") ? telDigitos : "55" + telDigitos;
      targetJid = `${comDDI}@s.whatsapp.net`;
    }

    const msgsRows: any[] = db.prepare("SELECT * FROM bot_mensagens").all() || [];
    const templates: Record<string, string> = {};
    for (const r of msgsRows) {
      templates[String(r.id)] = String(r.mensagem);
    }

    const templateMsg = templates["msg_ultimo_corte"] || 
      `Show, *{cliente}*! Seu corte foi registrado com sucesso! 💈\n\n⚠️ *Aviso do seu Clube VIP:*\nVocê utilizou todos os cortes inclusos no seu *{plano}* para este ciclo.\nSeu plano renova em *{vencimento}*.\n\nDeseja antecipar a renovação e liberar mais cortes agora mesmo?\nEnvie o Pix para nossa chave oficial: *{pix}* e mande o comprovante aqui!`;

    let vencimentoBR = String(m.data_vencimento || "");
    const parts = vencimentoBR.split("-");
    if (parts.length === 3) vencimentoBR = `${parts[2]}/${parts[1]}/${parts[0]}`;

    const texto = templateMsg
      .replace(/{cliente}/g, m.nome)
      .replace(/{plano}/g, m.plano_nome || "VIP Mensalista")
      .replace(/{vencimento}/g, vencimentoBR)
      .replace(/{barbearia}/g, String(config.nome_barbearia || "GM Barbershop"))
      .replace(/{pix}/g, String(config.chave_pix || config.telefone_principal || ""))
      .replace(/{link_booksy}/g, String(config.link_booksy || "https://booksy.com"));

    // Simula presença e digitação natural humana
    await sock.sendPresenceUpdate("composing", targetJid);
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
    await sock.sendPresenceUpdate("paused", targetJid);
    await enviarMensagemDoBot(targetJid, { text: texto });
    console.log(`[BOT AVISO] Notificação de fim de pacote enviada no WhatsApp de ${m.nome}!`);
  } catch (err) {
    console.error("[BOT AVISO] Erro ao enviar aviso de último corte:", err);
  }
}

/**
 * Rotina automática diária para envio de lembrete de renovação via WhatsApp
 * Verifica os clientes ativos a X dias do vencimento (configurável pelo painel)
 */
export async function processarAvisosRenovacaoAutomatica() {
  if (!sock || connectionStatus !== "CONECTADO") return { enviados: 0, pulados: 0, status: "DESCONECTADO" };

  try {
    const db = getDb();
    const config = db.prepare("SELECT * FROM configuracoes WHERE id = 'default'").get() as any || {};

    if (config.aviso_renovacao_ativo === 0) {
      console.log("[AVISO RENOVACAO] Aviso automático desativado nas configurações.");
      return { enviados: 0, pulados: 0, status: "DESATIVADO" };
    }

    const diasAntecedencia = Number(config.dias_aviso_renovacao ?? 3);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const hojeStr = hoje.toISOString().split("T")[0];

    const mensalistas: any[] = db.prepare(`
      SELECT m.*, p.nome as plano_nome 
      FROM mensalistas m 
      LEFT JOIN planos p ON m.plano_id = p.id 
      WHERE m.status = 'ATIVO' AND m.data_vencimento IS NOT NULL
    `).all() || [];

    const msgsRows: any[] = db.prepare("SELECT * FROM bot_mensagens").all() || [];
    const templates: Record<string, string> = {};
    for (const r of msgsRows) {
      templates[String(r.id)] = String(r.mensagem);
    }

    const templateMsg = templates["msg_lembrete_renovacao"] || 
      `Fala *{cliente}*, beleza? Passando para te lembrar que a renovação do seu plano VIP *{plano}* vence no dia *{vencimento}*. 👑\n\nPara manter seus benefícios garantidos sem fila:\n🔑 Chave Pix: *{pix}*\n\nApós transferir, só mandar o comprovante aqui pra gente atualizar seu saldo na hora! Tmj! 👊🔥`;

    const barbearia = String(config.nome_barbearia || "GM Barbershop");
    const chavePix = String(config.chave_pix || config.telefone_principal || "");
    const linkBooksy = String(config.link_booksy || "https://booksy.com");

    let enviados = 0;
    let pulados = 0;

    for (const m of mensalistas) {
      try {
        const parts = String(m.data_vencimento).split("-").map(Number);
        if (parts.length !== 3) continue;
        const dataVenc = new Date(parts[0], parts[1] - 1, parts[2]);
        dataVenc.setHours(0, 0, 0, 0);

        const diffDias = Math.round((dataVenc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));

        // Envia se estiver dentro da janela de antecedência (<= diasAntecedencia e >= 0 dias)
        if (diffDias <= diasAntecedencia && diffDias >= 0) {
          // Evita envio duplicado no mesmo dia
          if (m.ultimo_aviso_renovacao === hojeStr) {
            pulados++;
            continue;
          }

          let targetJid = m.whatsapp_lid;
          if (!targetJid || !targetJid.includes("@")) {
            const telDigitos = String(m.whatsapp || "").replace(/\D/g, "");
            if (telDigitos.length < 10) continue;
            const comDDI = telDigitos.startsWith("55") ? telDigitos : "55" + telDigitos;
            targetJid = `${comDDI}@s.whatsapp.net`;
          }

          const vencimentoBR = `${String(parts[2]).padStart(2, "0")}/${String(parts[1]).padStart(2, "0")}/${parts[0]}`;
          
          let textoFinal = templateMsg
            .replace(/{cliente}/g, m.nome)
            .replace(/{plano}/g, m.plano_nome || "VIP Mensalista")
            .replace(/{vencimento}/g, vencimentoBR)
            .replace(/{barbearia}/g, barbearia)
            .replace(/{pix}/g, chavePix)
            .replace(/{link_booksy}/g, linkBooksy)
            .replace(/{dias_restantes}/g, String(diffDias));

          // Pausa humana entre disparos sucessivos (2.5 a 4 segundos)
          await new Promise(r => setTimeout(r, 2500 + Math.random() * 1500));

          await enviarMensagemDoBot(targetJid, { text: textoFinal });
          enviados++;

          // Registrar data do envio para não reenviar no mesmo dia
          db.prepare("UPDATE mensalistas SET ultimo_aviso_renovacao = ? WHERE id = ?").run(hojeStr, m.id);
          console.log(`[BOT AVISO] Lembrete de renovação enviado com sucesso para ${m.nome} (${diffDias} dias restantes)!`);
        }
      } catch (errM) {
        console.error(`[BOT AVISO] Erro ao enviar lembrete para ${m.nome}:`, errM);
      }
    }

    return { enviados, pulados, status: "OK", diasAntecedencia };
  } catch (err) {
    console.error("[BOT AVISO] Erro na rotina de aviso de renovação:", err);
    return { error: String(err) };
  }
}

/**
 * Dispara o processamento consolidado de mensagens acumuladas no buffer de um chat
 * Garante que mensagens consecutivas rápidas sejam agrupadas e NUNCA perdidas
 */
async function dispararProcessamentoChat(remoteJid: string) {
  const chatState = chatBuffers.get(remoteJid);
  if (!chatState || chatState.mensagens.length === 0 || chatState.processando) return;

  // Se o robô estiver pausado globalmente
  if (isRoboPausado()) {
    chatState.mensagens = [];
    console.log(`[ROBÔ PAUSADO GLOBALMENTE] Buffer de ${remoteJid} descartado enquanto robô em pausa.`);
    return;
  }

  // Se o atendimento humano estiver ativo para esta conversa
  if (verificarAtendimentoHumanoAtivo(remoteJid)) {
    const temComandoReativar = chatState.mensagens.some(m => ehComandoReativarBot(m.texto));
    if (!temComandoReativar) {
      chatState.mensagens = [];
      console.log(`[ROBÔ SILENCIADO] Atendimento humano ativo para ${remoteJid}. Mensagens acumuladas não dispararão o robô.`);
      return;
    }
    removerPausaAtendimentoHumano(remoteJid);
    console.log(`[ROBÔ REATIVADO] Conversa com ${remoteJid} reativada por comando no buffer!`);
  }

  chatState.processando = true;

  try {
    const lote = [...chatState.mensagens];
    chatState.mensagens = [];

    // Junta todo o texto das mensagens consecutivas (ex: "oi" + "não vou conseguir ir às 9")
    const textoConsolidado = lote
      .map(m => m.texto)
      .filter(Boolean)
      .join(" ")
      .trim();

    const temAudio = lote.some(m => m.ehAudio);
    const temImagem = lote.some(m => m.ehImagem);
    const ultimo = lote[lote.length - 1];

    const numeroLimpo = remoteJid.replace(/[^0-9]/g, "");
    const extraInfo = {
      senderPn: ultimo?.senderPn,
      participantPn: ultimo?.participantPn,
      pushName: ultimo?.pushName,
      ehAudio: temAudio,
      ehImagem: temImagem
    };

    console.log(`[BOT PROCESSAR] Lote de ${lote.length} mensagem(ns) de ${remoteJid}: '${textoConsolidado}' (Áudio: ${temAudio}, Imagem: ${temImagem})`);

    await processarMensagemRobo(remoteJid, numeroLimpo, textoConsolidado, extraInfo);
  } catch (err) {
    console.error(`[BOT ERRO] Erro ao processar chat ${remoteJid}:`, err);
  } finally {
    chatState.processando = false;

    // Se o cliente mandou novas mensagens enquanto o robô digitava ou enviava:
    if (chatState.mensagens.length > 0) {
      console.log(`[BOT FILA] ${chatState.mensagens.length} mensagem(ns) acumuladas para ${remoteJid}. Agendando próximo envio...`);
      chatState.timer = setTimeout(async () => {
        chatState.timer = null;
        await dispararProcessamentoChat(remoteJid);
      }, 1500);
    }
  }
}

export async function iniciarWhatsAppBot() {
  if (sock && connectionStatus === "CONECTADO") {
    return { status: connectionStatus, qr: currentQr, numero: connectedNumber, pausado: isRoboPausado() };
  }

  if (isConnecting) {
    return { status: connectionStatus, qr: currentQr, numero: connectedNumber };
  }

  isConnecting = true;

  // Limpeza de socket residual para evitar múltiplos listeners em paralelo
  if (sock) {
    try {
      sock.ev?.removeAllListeners("messages.upsert");
      sock.ev?.removeAllListeners("connection.update");
      sock.ev?.removeAllListeners("creds.update");
      sock.end?.();
    } catch (e) {}
    sock = null;
  }

  try {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      msgRetryCounterCache,
      placeholderResendCache,
      getMessage: recuperarMensagemDoCache,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      defaultQueryTimeoutMs: 60000,
      syncFullHistory: false
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentQr = await QRCode.toDataURL(qr);
        connectionStatus = "AGUARDANDO_QR";
        isConnecting = false;
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        connectionStatus = "DESCONECTADO";
        currentQr = null;
        isConnecting = false;

        if (isLoggedOut) {
          console.log("[BOT] Sessão desconectada/expirada no WhatsApp. Limpando credenciais antigas para novo QR Code...");
          if (fs.existsSync(AUTH_DIR)) {
            try {
              fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            } catch (e) {}
          }
          setTimeout(() => iniciarWhatsAppBot(), 1500);
        } else {
          setTimeout(() => iniciarWhatsAppBot(), 5000);
        }
      } else if (connection === "open") {
        connectionStatus = "CONECTADO";
        currentQr = null;
        isConnecting = false;
        connectedNumber = sock?.user?.id?.split(":")[0] || "Conectado";
        console.log(`[BOT] Conexão aberta com sucesso! WhatsApp conectado: ${connectedNumber}`);
        try { carregarAtendimentosDoBanco(); } catch (e) {}
        setTimeout(() => {
          sincronizarLidsMensalistas().catch(() => {});
        }, 1500);

        // Disparar checagem de lembretes de renovação após 8 segundos
        setTimeout(() => {
          processarAvisosRenovacaoAutomatica().catch(() => {});
        }, 8000);

        // Agendar checagem recorrente a cada 2 horas
        if (!(global as any).__avisoRenovacaoInterval) {
          (global as any).__avisoRenovacaoInterval = setInterval(() => {
            processarAvisosRenovacaoAutomatica().catch(() => {});
          }, 2 * 60 * 60 * 1000);
        }
      }
    });

    // Mapeamento automático de números compartilhados pelo WhatsApp Multi-Dispositivo
    sock.ev.on("chats.phoneNumberShare", ({ lid, jid }: any) => {
      try {
        if (lid && jid) {
          const telLimpo = String(jid).replace(/\D/g, "");
          const lidLimpo = String(lid).replace(/\D/g, "");
          lidToPhoneMap.set(lid, telLimpo);
          lidToPhoneMap.set(lidLimpo, telLimpo);

          const db = getDb();
          db.prepare(`
            UPDATE mensalistas SET whatsapp_lid = ? 
            WHERE replace(replace(replace(replace(replace(whatsapp, '(', ''), ')', ''), '-', ''), ' ', ''), '+', '') LIKE ?
          `).run(lid, `%${telLimpo.slice(-8)}%`);
          console.log(`[BOT SHARE] Número recebido via protocolo: LID ${lid} -> Tel ${telLimpo}`);
        }
      } catch (e) {}
    });

    sock.ev.on("messages.upsert", async (m: any) => {
      // 1. Filtrar APENAS eventos do tipo "notify" (ignora append, sync de histórico e receipts repetidos)
      if (m.type !== "notify" || !m.messages || m.messages.length === 0) return;

      for (const msg of m.messages) {
        try {
          if (!msg || !msg.message) continue;

          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") continue;

          // 1. DETECÇÃO INTELIGENTE DE INTERVENÇÃO HUMANA
          // Se a mensagem partiu da barbearia (fromMe = true):
          if (msg.key.fromMe) {
            const msgId = msg.key.id;
            if (msgId && mensagensEnviadasPeloRobo.has(msgId)) {
              // Foi o próprio robô que disparou esta mensagem automaticamente
              mensagensEnviadasPeloRobo.delete(msgId);
              continue;
            }

            // SE NÃO FOI O ROBÔ, FOI O BARBEIRO / ATENDENTE NO CELULAR OU NO WHATSAPP WEB!
            const telLimpo = remoteJid.replace(/[^0-9]/g, "");
            const textoAtendente = (
              msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              ""
            ).trim().toLowerCase();

            // COMANDO 1: INICIAR ATENDIMENTO MANUALMENTE (#INICIAR)
            if (
              textoAtendente === "#iniciar" ||
              textoAtendente === "iniciar" ||
              textoAtendente === "iniciar atendimento" ||
              textoAtendente === "iniciando atendimento" ||
              textoAtendente === "#atender" ||
              textoAtendente === "#humano" ||
              textoAtendente === "assumir atendimento" ||
              textoAtendente === "!atender"
            ) {
              ativarPausaAtendimentoHumano(
                remoteJid,
                "Atendente iniciou atendimento manualmente ('iniciar atendimento')",
                (msg as any)?.pushName,
                telLimpo
              );
              console.log(`[COMANDO ATENDIMENTO] Atendente digitou 'iniciar atendimento' para ${remoteJid}!`);
              
              try {
                const db = getDb();
                const cfg: any = db.prepare("SELECT nome_barbearia FROM configuracoes WHERE id = 'default'").get() || {};
                const nomeBarbearia = String(cfg.nome_barbearia || "GM Barbershop");
                const msgRow: any = db.prepare("SELECT mensagem FROM bot_mensagens WHERE id = 'msg_humano_assumiu'").get();
                const template = msgRow?.mensagem || "👨‍💼 *Atendimento Iniciado:* Nosso profissional da equipe *{barbearia}* acabou de assumir a conversa e falará diretamente com você a partir de agora! 💈";
                const textoFormatado = template.replace(/{barbearia}/g, nomeBarbearia).replace(/{cliente}/g, (msg as any)?.pushName || "amigo");
                await enviarMensagemDoBot(remoteJid, { text: textoFormatado });
              } catch (e) {}

              continue;
            }

            // COMANDO 2: REATIVAR O ROBÔ NA CONVERSA (#ATIVAR)
            if (
              textoAtendente === "#ativar" ||
              textoAtendente === "ativar" ||
              textoAtendente === "#reativar" ||
              textoAtendente === "reativar" ||
              textoAtendente === "finalizar atendimento" ||
              textoAtendente === "encerrar atendimento" ||
              textoAtendente === "#finalizar" ||
              textoAtendente === "#encerrar" ||
              textoAtendente === "#bot" ||
              textoAtendente === "!finalizar"
            ) {
              removerPausaAtendimentoHumano(remoteJid);
              console.log(`[COMANDO ENCERRAMENTO] Atendente digitou 'finalizar atendimento' para ${remoteJid}!`);
              
              try {
                const db = getDb();
                const cfg: any = db.prepare("SELECT nome_barbearia FROM configuracoes WHERE id = 'default'").get() || {};
                const nomeBarbearia = String(cfg.nome_barbearia || "GM Barbershop");
                const msgRow: any = db.prepare("SELECT mensagem FROM bot_mensagens WHERE id = 'msg_fim_atendimento'").get();
                const template = msgRow?.mensagem || "✅ *Atendimento finalizado!* Agradecemos a preferência na *{barbearia}*. Se precisar agendar ou tirar dúvidas a qualquer momento, basta mandar um *oi* que o robô estará à disposição! 💈";
                const textoFormatado = template.replace(/{barbearia}/g, nomeBarbearia).replace(/{cliente}/g, (msg as any)?.pushName || "amigo");
                await enviarMensagemDoBot(remoteJid, { text: textoFormatado });
              } catch (e) {}

              continue;
            }

                        // COMANDO 3: PAUSAR ROBÔ GLOBALMENTE PELO WHATSAPP
            if (
              textoAtendente === "pausar bot" ||
              textoAtendente === "#pausar bot" ||
              textoAtendente === "#pausar" ||
              textoAtendente === "pausar robo" ||
              textoAtendente === "#pausa"
            ) {
              setRoboPausado(true);
              console.log("[COMANDO WHATSAPP] Robô pausado globalmente pelo atendente!");
              try {
                const db = getDb();
                const cfg: any = db.prepare("SELECT nome_barbearia FROM configuracoes WHERE id = 'default'").get() || {};
                const nomeBarbearia = String(cfg.nome_barbearia || "GM Barbershop");
                await enviarMensagemDoBot(remoteJid, { 
                  text: `⏸️ *Robô da ${nomeBarbearia} Pausado!*\n\nA conexão continua ativa, mas o robô *não responderá* mensagens automáticas até ser retomado.\n\n_Para retomar, digite *retomar bot* aqui ou clique em 'Retomar Robô' no painel._` 
                });
              } catch (e) {}
              continue;
            }

            // COMANDO 4: RETOMAR ROBÔ GLOBALMENTE PELO WHATSAPP
            if (
              textoAtendente === "retomar bot" ||
              textoAtendente === "#retomar bot" ||
              textoAtendente === "#despausar" ||
              textoAtendente === "#ativar bot" ||
              textoAtendente === "iniciar bot" ||
              textoAtendente === "despausar bot"
            ) {
              setRoboPausado(false);
              console.log("[COMANDO WHATSAPP] Robô retomado globalmente pelo atendente!");
              try {
                const db = getDb();
                const cfg: any = db.prepare("SELECT nome_barbearia FROM configuracoes WHERE id = 'default'").get() || {};
                const nomeBarbearia = String(cfg.nome_barbearia || "GM Barbershop");
                await enviarMensagemDoBot(remoteJid, { 
                  text: `▶️ *Robô da ${nomeBarbearia} Retomado!*\n\nAs respostas automáticas e o menu voltaram a operar normalmente para todos os clientes! 💈` 
                });
              } catch (e) {}
              continue;
            }

            // Qualquer outra mensagem digitada pelo atendente no celular ativa/renova a pausa
            ativarPausaAtendimentoHumano(
              remoteJid,
              "Atendente conversando no celular",
              (msg as any)?.pushName,
              telLimpo
            );
            console.log(`[PAUSA ROBÔ] Atendente humano enviou mensagem para ${remoteJid}. Robô pausado para esta conversa.`);
            continue;
          }

          // Ignorar reações, mensagens apagadas, recibos de leitura e protocolos
          if (msg.message.protocolMessage || msg.message.reactionMessage) continue;

          // 2. DEDUPLICAÇÃO ABSOLUTA & REGISTRO NO CACHE DE CRIPTOGRAFIA
          const msgId = msg.key.id;
          if (!msgId || mensagensProcessadas.has(msgId)) continue;
          mensagensProcessadas.add(msgId);
          if (msg.message) {
            salvarMensagemNoCache(msgId, msg.key.remoteJid, msg.message);
          }

          // Manter o cache controlado para evitar acúmulo de memória
          if (mensagensProcessadas.size > 2000) {
            const first = mensagensProcessadas.values().next().value;
            if (first) mensagensProcessadas.delete(first);
          }

          // Extrair texto da mensagem (ou verificar se é áudio / mídia)
          const textoCliente = (
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.videoMessage?.caption ||
            ""
          ).trim().toLowerCase();

          // 3. VERIFICAR SE O ATENDIMENTO HUMANO ESTÁ ATIVO PARA ESTA CONVERSA
                    // VERIFICAÇÃO DE PAUSA GLOBAL DO ROBÔ (Pausado no painel ou via comando)
          if (isRoboPausado()) {
            console.log(`[ROBÔ PAUSADO GLOBALMENTE] Mensagem de ${remoteJid} ignorada enquanto em pausa: '${textoCliente}'`);
            continue;
          }

          if (verificarAtendimentoHumanoAtivo(remoteJid)) {
            // Se o cliente digitar "oi", "menu", "voltar", etc., reativa o robô na hora!
            if (ehComandoReativarBot(textoCliente)) {
              removerPausaAtendimentoHumano(remoteJid);
              console.log(`[ROBÔ REATIVADO] Conversa com ${remoteJid} reativada por comando ('${textoCliente}')!`);
              // Segue o fluxo normal para adicionar ao buffer e responder o menu!
            } else {
              // Renova a janela de pausa para continuar a conversa livre sem o robô atrapalhar
              const telLimpo = remoteJid.replace(/[^0-9]/g, "");
              ativarPausaAtendimentoHumano(
                remoteJid,
                "Conversa ativa com atendente humano",
                msg.pushName,
                telLimpo
              );
              console.log(`[ROBÔ SILENCIADO] Atendimento humano em andamento com ${remoteJid}. Robô permaneceu em silêncio.`);
              continue;
            }
          }

          // 4. Ignorar mensagens antigas de sincronização de histórico (> 90 segundos)
          const timestampMsg = Number(msg.messageTimestamp) * 1000;
          if (timestampMsg && Date.now() - timestampMsg > 90000) {
            continue;
          }

          // 5. Preservar notificações no celular:
          // NÃO marcamos como lida no Baileys (sock.readMessages) para que o WhatsApp do barbeiro
          // toque, vibre e exiba o aviso de mensagem não lida normalmente no celular.

          // 6. Extrair se é áudio (PTT) ou mídia
          const ehAudio = Boolean(
            msg.message.audioMessage ||
            (msg.message as any)?.ptvMessage
          );
          const ehImagem = Boolean(
            msg.message.imageMessage ||
            msg.message.videoMessage ||
            msg.message.documentMessage
          );

          // 7. Enfileirar no buffer inteligente com debounce por chat
          if (!chatBuffers.has(remoteJid)) {
            chatBuffers.set(remoteJid, {
              mensagens: [],
              timer: null,
              processando: false
            });
          }
          const chatState = chatBuffers.get(remoteJid)!;

          chatState.mensagens.push({
            texto: textoCliente,
            ehAudio,
            ehImagem,
            pushName: msg.pushName || (msg as any)?.verifiedBizName,
            senderPn: (msg.key as any)?.senderPn,
            participantPn: (msg.key as any)?.participantPn
          });

          // Se o robô já está ativamente enviando uma resposta para este chat:
          // A nova mensagem fica guardada na fila e NUNCA é descartada!
          if (chatState.processando) {
            console.log(`[BOT FILA] Mensagem de ${remoteJid} adicionada à fila (robô ocupado respondendo)`);
            continue;
          }

          // Se não está processando, reinicia a janela de debounce (2200ms)
          // Isso junta frases consecutivas que o cliente envia rapidamente (ex: "oi" ... "não vou conseguir ir às 9")
          if (chatState.timer) {
            clearTimeout(chatState.timer);
          }

          chatState.timer = setTimeout(async () => {
            chatState.timer = null;
            await dispararProcessamentoChat(remoteJid);
          }, 2200);
        } catch (err) {
          console.error("Erro ao processar mensagem do robô:", err);
        }
      }
    });

    return { status: connectionStatus, qr: currentQr, numero: connectedNumber };
  } catch (err) {
    isConnecting = false;
    connectionStatus = "DESCONECTADO";
    console.error("Erro ao inicializar WhatsApp Baileys:", err);
    return { status: connectionStatus, qr: null, numero: null };
  }
}


// Estado de Pausa Global do Robô (mantém a conexão ativa, mas suspende as respostas automáticas)
let roboPausadoGlobalmente = false;

export function isRoboPausado(): boolean {
  try {
    const db = getDb();
    const cfg: any = db.prepare("SELECT robo_pausado, licenca_status FROM configuracoes WHERE id = 'default'").get();
    // Se a licença da barbearia estiver suspensa por inadimplência, o robô é forçado a pausar
    if (cfg?.licenca_status === "BLOQUEADO") {
      return true;
    }
    if (cfg && cfg.robo_pausado !== undefined && cfg.robo_pausado !== null) {
      roboPausadoGlobalmente = Boolean(cfg.robo_pausado);
    }
  } catch (e) {}
  return roboPausadoGlobalmente;
}

export function setRoboPausado(pausado: boolean): boolean {
  roboPausadoGlobalmente = pausado;
  try {
    const db = getDb();
    db.prepare("UPDATE configuracoes SET robo_pausado = ? WHERE id = 'default'").run(pausado ? 1 : 0);
    console.log(`[ROBÔ PAUSA GLOBAL] Estado alterado para: ${pausado ? "PAUSADO" : "ATIVO"}`);
  } catch (e) {
    console.error("[PAUSA GLOBAL] Erro ao persistir no SQLite:", e);
  }
  return roboPausadoGlobalmente;
}

export function getBotStatus() {
  return { status: connectionStatus, qr: currentQr, numero: connectedNumber, pausado: isRoboPausado() };
}

export async function desconectarBot() {
  isConnecting = false;
  if (sock) {
    try {
      sock.ev?.removeAllListeners("messages.upsert");
      sock.ev?.removeAllListeners("connection.update");
      sock.ev?.removeAllListeners("creds.update");
      await sock.logout();
    } catch (e) {}
    sock = null;
  }
  mensagensProcessadas.clear();
  chatBuffers.clear();
  connectionStatus = "DESCONECTADO";
  currentQr = null;
  connectedNumber = null;
  if (fs.existsSync(AUTH_DIR)) {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  }
  return { success: true };
}

function obterCatalogoServicosFormatado(db: any): string {
  const rows: any[] = db.prepare(`
    SELECT nome, categoria, preco, preco_a_partir_de 
    FROM servicos 
    WHERE ativo = 1 
    ORDER BY preco ASC
  `).all() || [];

  if (rows.length === 0) return "Nenhum serviço cadastrado no momento. Consulte nossa equipe!";

  function classificar(s: any): "Cabelo" | "Barba" | "Química" | "Combos" | "Outros" {
    const n = (s.nome || "").toLowerCase();
    const c = (s.categoria || "").toLowerCase();
    if (
      c === "combos" ||
      n.includes("combo") ||
      n.includes("+") ||
      (n.includes("corte") && (n.includes("barba") || n.includes("prog") || n.includes("botox") || n.includes("relax") || n.includes("sobrancelha") || n.includes("sob")))
    ) {
      return "Combos";
    }
    if (
      c === "quimica" ||
      c === "química" ||
      n.includes("luzes") ||
      n.includes("platinado") ||
      n.includes("nevou") ||
      n.includes("progressiva") ||
      n.includes("botox") ||
      n.includes("selagem") ||
      n.includes("relaxamento") ||
      n.includes("coloração") ||
      n.includes("coloracao") ||
      n.includes("matizador") ||
      n.includes("descolor")
    ) {
      return "Química";
    }
    if (c === "barba" || n.includes("barba")) {
      return "Barba";
    }
    if (c === "cabelo" || n.includes("corte") || n.includes("penteado") || n.includes("sobrancelha") || n.includes("hidratação") || n.includes("hidratacao")) {
      return "Cabelo";
    }
    return "Outros";
  }

  const grupos: Record<string, any[]> = {
    "Cabelo": [],
    "Barba": [],
    "Química": [],
    "Combos": [],
    "Outros": []
  };

  for (const r of rows) {
    const cat = classificar(r);
    grupos[cat].push(r);
  }

  // Ordenar Cabelo colocando "Corte" tradicional no topo
  grupos["Cabelo"].sort((a, b) => {
    if (a.nome.toLowerCase() === "corte") return -1;
    if (b.nome.toLowerCase() === "corte") return 1;
    return Number(a.preco) - Number(b.preco);
  });

  const titulos: Record<string, string> = {
    "Cabelo": "✂️ *CORTES & CABELO*",
    "Barba": "🧔 *SERVIÇOS DE BARBA*",
    "Química": "⚡ *QUÍMICAS, LUZES & PLATINADO*",
    "Combos": "🔥 *COMBOS & PACOTES*",
    "Outros": "💈 *OUTROS SERVIÇOS*"
  };

  const blocos: string[] = [];
  for (const [k, arr] of Object.entries(grupos)) {
    if (arr.length === 0) continue;
    const linhas = arr.map(s => {
      const precoFormatado = Number(s.preco).toFixed(2).replace(".", ",");
      const aPartir = s.preco_a_partir_de ? " (a partir de)" : "";
      return `• *${s.nome}* - R$ ${precoFormatado}${aPartir}`;
    });
    blocos.push(`${titulos[k]}\n${linhas.join("\n")}`);
  }

  return blocos.join("\n\n");
}

function obterServicosBarbaFormatado(db: any): string {
  const rows: any[] = db.prepare(`
    SELECT nome, preco, preco_a_partir_de 
    FROM servicos 
    WHERE ativo = 1 AND (categoria = 'Barba' OR nome LIKE '%barba%')
    ORDER BY preco ASC
  `).all() || [];

  if (rows.length === 0) return "Consulte nossos valores de barba pelo Booksy!";

  return rows.map(s => {
    const precoFormatado = Number(s.preco).toFixed(2).replace(".", ",");
    const aPartir = s.preco_a_partir_de ? " (a partir de)" : "";
    return `👉 *${s.nome}*: R$ ${precoFormatado}${aPartir}`;
  }).join("\n");
}

function obterServicosQuimicaFormatado(db: any): string {
  const rows: any[] = db.prepare(`
    SELECT nome, preco, preco_a_partir_de 
    FROM servicos 
    WHERE ativo = 1 AND (
      nome LIKE '%platinado%' OR 
      nome LIKE '%luzes%' OR 
      nome LIKE '%progressiva%' OR 
      nome LIKE '%botox%' OR 
      nome LIKE '%selagem%' OR 
      nome LIKE '%colora%' OR 
      nome LIKE '%relaxamento%'
    )
    ORDER BY preco ASC
  `).all() || [];

  if (rows.length === 0) return "Consulte nossos procedimentos químicos pelo Booksy!";

  return rows.map(s => {
    const precoFormatado = Number(s.preco).toFixed(2).replace(".", ",");
    const aPartir = s.preco_a_partir_de ? " (a partir de)" : "";
    return `⚡ *${s.nome}*: R$ ${precoFormatado}${aPartir}`;
  }).join("\n");
}

function obterPlanosVipFormatados(db: any): string {
  const rows: any[] = db.prepare(`
    SELECT nome, preco_mensal, cortes_cabelo_inclusos, barbas_inclusas, inclui_sobrancelha, descricao 
    FROM planos 
    WHERE ativo = 1 
    ORDER BY preco_mensal ASC
  `).all() || [];

  if (rows.length === 0) return "Consulte nossos planos VIP diretamente com a equipe!";

  const blocos = rows.map((p) => {
    const precoFormatado = Number(p.preco_mensal).toFixed(2).replace(".", ",");
    const linhas: string[] = [];
    if (p.cortes_cabelo_inclusos > 0) {
      linhas.push(`• ${p.cortes_cabelo_inclusos} cortes de cabelo no mês (1 por semana)`);
    }
    if (p.barbas_inclusas > 0) {
      linhas.push(`• ${p.barbas_inclusas} barbas no mês`);
    }
    if (p.inclui_sobrancelha) {
      linhas.push(`• Sobrancelhas inclusas`);
    }
    if (p.descricao && !p.descricao.includes("corte por semana")) {
      linhas.push(`• ${p.descricao}`);
    } else if (p.descricao && p.descricao.includes("desconto")) {
      linhas.push(`• 10% de desconto em pomadas e produtos`);
    }
    return `🏆 *Plano ${p.nome}:* R$ ${precoFormatado}/mês\n${linhas.join("\n")}`;
  });

  return blocos.join("\n\n");
}

function extrairCoordenadas(textoOuUrl: string): { lat: number; lng: number } | null {
  if (!textoOuUrl || typeof textoOuUrl !== "string") return null;

  // 1. Padrão @lat,lng (ex: https://www.google.com/maps/@-23.550520,-46.633308,17z)
  const matchArroba = textoOuUrl.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (matchArroba) {
    return { lat: parseFloat(matchArroba[1]), lng: parseFloat(matchArroba[2]) };
  }

  // 2. Padrão query param q=lat,lng ou ll=lat,lng ou query=lat,lng
  const matchQuery = textoOuUrl.match(/[?&](?:q|ll|query)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (matchQuery) {
    return { lat: parseFloat(matchQuery[1]), lng: parseFloat(matchQuery[2]) };
  }

  // 3. Padrão data=!3dlat!4dlng (links de locais no Google Maps)
  const matchData = textoOuUrl.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (matchData) {
    return { lat: parseFloat(matchData[1]), lng: parseFloat(matchData[2]) };
  }

  // 4. Padrão direto "lat, lng" (ex: -23.550520, -46.633308)
  const matchDireto = textoOuUrl.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (matchDireto) {
    return { lat: parseFloat(matchDireto[1]), lng: parseFloat(matchDireto[2]) };
  }

  return null;
}

async function processarMensagemRobo(
  remoteJid: string,
  numeroLimpo: string,
  texto: string,
  extraInfo?: {
    senderPn?: string;
    participantPn?: string;
    pushName?: string;
    ehAudio?: boolean;
    ehImagem?: boolean;
  }
) {
  const db = getDb();

  // Obter configurações da barbearia
  const config: Record<string, any> = db.prepare("SELECT * FROM configuracoes WHERE id = 'default'").get() as any || {};

  // Obter todas as mensagens configuradas no SQLite
  const msgsRows: any[] = db.prepare("SELECT * FROM bot_mensagens").all() || [];
  const templates: Record<string, string> = {};
  for (const row of msgsRows) {
    templates[String(row.id)] = String(row.mensagem);
  }

  // Identificação robusta e inteligente do Mensalista VIP (compatível com LID e números com/sem o 9)
  let mensalista: Record<string, any> | null = null;
  const isLid = remoteJid.endsWith("@lid") || numeroLimpo.length >= 14;

  // 1. Busca direta por LID no SQLite
  if (isLid) {
    mensalista = db.prepare(
      `SELECT m.*, p.nome as plano_nome 
       FROM mensalistas m 
       LEFT JOIN planos p ON m.plano_id = p.id 
       WHERE m.status = 'ATIVO' AND (m.whatsapp_lid = ? OR m.whatsapp_lid = ? OR m.whatsapp_lid LIKE ?)`
    ).get(remoteJid, numeroLimpo, `%${numeroLimpo}%`) as any || null;
  }

  // 2. Se não encontrou por LID, verificar no cache em memória lidToPhoneMap
  let telefoneParaBusca = "";
  if (isLid) {
    if (lidToPhoneMap.has(remoteJid)) {
      telefoneParaBusca = lidToPhoneMap.get(remoteJid)!;
    } else if (lidToPhoneMap.has(numeroLimpo)) {
      telefoneParaBusca = lidToPhoneMap.get(numeroLimpo)!;
    }
  }

  // 3. Verificar se o pacote WhatsApp trouxe senderPn ou participantPn
  if (!telefoneParaBusca && extraInfo?.senderPn) {
    telefoneParaBusca = String(extraInfo.senderPn).replace(/\D/g, "");
  }
  if (!telefoneParaBusca && extraInfo?.participantPn) {
    telefoneParaBusca = String(extraInfo.participantPn).replace(/\D/g, "");
  }

  // 4. Se o remoteJid for @s.whatsapp.net, o próprio remoteJid é o telefone
  if (!telefoneParaBusca && remoteJid.endsWith("@s.whatsapp.net")) {
    telefoneParaBusca = numeroLimpo;
  }

  // 5. Se temos um número de telefone identificado, buscar no banco pelos últimos 8 dígitos
  if (!mensalista && telefoneParaBusca && telefoneParaBusca.length >= 8) {
    const ultimos8 = telefoneParaBusca.slice(-8);
    mensalista = db.prepare(
      `SELECT m.*, p.nome as plano_nome 
       FROM mensalistas m 
       LEFT JOIN planos p ON m.plano_id = p.id 
       WHERE m.status = 'ATIVO' AND replace(replace(replace(replace(replace(m.whatsapp, '(', ''), ')', ''), '-', ''), ' ', ''), '+', '') LIKE ?`
    ).get(`%${ultimos8}%`) as any || null;

    // Se encontrou e o chat atual é LID, salvar imediatamente no banco para as próximas consultas
    if (mensalista && isLid) {
      try {
        db.prepare("UPDATE mensalistas SET whatsapp_lid = ? WHERE id = ?").run(remoteJid, mensalista.id);
        lidToPhoneMap.set(remoteJid, telefoneParaBusca);
        lidToPhoneMap.set(numeroLimpo, telefoneParaBusca);
        console.log(`[BOT AUTO-VINCULO] LID ${remoteJid} vinculado ao mensalista ${mensalista.nome}!`);
      } catch (e) {}
    }
  }

  // 6. Se ainda não encontrou e é LID, tentar sincronizar sob demanda com o WhatsApp agora
  if (!mensalista && isLid && sock && connectionStatus === "CONECTADO") {
    try {
      await sincronizarLidsMensalistas();
      mensalista = db.prepare(
        `SELECT m.*, p.nome as plano_nome 
         FROM mensalistas m 
         LEFT JOIN planos p ON m.plano_id = p.id 
         WHERE m.status = 'ATIVO' AND (m.whatsapp_lid = ? OR m.whatsapp_lid = ? OR m.whatsapp_lid LIKE ?)`
      ).get(remoteJid, numeroLimpo, `%${numeroLimpo}%`) as any || null;
    } catch (e) {}
  }

  // 7. Fallback inteligente por pushName (se for LID e ainda sem identificação)
  if (!mensalista && isLid && extraInfo?.pushName) {
    const primeiroNomePush = String(extraInfo.pushName).split(" ")[0].trim().toLowerCase();
    if (primeiroNomePush.length >= 3) {
      const candidatos: any[] = db.prepare(
        `SELECT m.*, p.nome as plano_nome 
         FROM mensalistas m 
         LEFT JOIN planos p ON m.plano_id = p.id 
         WHERE m.status = 'ATIVO' AND (LOWER(m.nome) LIKE ? OR LOWER(m.nome) LIKE ?)`
      ).all(`${primeiroNomePush}%`, `% ${primeiroNomePush}%`) as any || [];

      if (candidatos.length === 1) {
        mensalista = candidatos[0];
        try {
          db.prepare("UPDATE mensalistas SET whatsapp_lid = ? WHERE id = ?").run(remoteJid, mensalista.id);
          const telMens = String(mensalista.whatsapp).replace(/\D/g, "");
          lidToPhoneMap.set(remoteJid, telMens);
          lidToPhoneMap.set(numeroLimpo, telMens);
          console.log(`[BOT VINCULO POR NOME] LID ${remoteJid} vinculado ao mensalista ${mensalista.nome} via pushName "${extraInfo.pushName}"`);
        } catch (e) {}
      }
    }
  }

  const nomeCliente = String(mensalista?.nome || extraInfo?.pushName || "Amigo");
  const telefoneRealCliente = String(mensalista?.whatsapp || telefoneParaBusca || numeroLimpo);
  const barbearia = String(config.nome_barbearia || "GM Barbershop");
  const linkBooksy = String(config.link_booksy || "https://booksy.com");
  const chavePix = String(config.chave_pix || config.telefone_principal || "11960129564");
  const endereco = String(config.endereco || "Rua Exemplo da GM, 100 - São Paulo/SP");
  const horario = String(config.horario_funcionamento || "Terça a Sábado das 09h às 20h");

  // Obter coordenadas GPS limpas
  let latGps: number | null = (config.latitude !== null && config.latitude !== undefined && config.latitude !== "") ? Number(config.latitude) : null;
  let lngGps: number | null = (config.longitude !== null && config.longitude !== undefined && config.longitude !== "") ? Number(config.longitude) : null;
  if ((latGps === null || lngGps === null || isNaN(latGps) || isNaN(lngGps)) && config.link_google_maps) {
    const extraido = extrairCoordenadas(config.link_google_maps);
    if (extraido) {
      latGps = extraido.lat;
      lngGps = extraido.lng;
    }
  }

  // Link do Google Maps limpo e curto (evita quebrar linhas feias como Aw%3D%3D no WhatsApp)
  let maps = String(config.link_google_maps || "https://maps.google.com");
  if (latGps !== null && lngGps !== null && !isNaN(latGps) && !isNaN(lngGps)) {
    maps = `https://maps.google.com/?q=${latGps},${lngGps}`;
  }

  // Helper para substituir todas as variáveis dinâmicas em qualquer mensagem
  const preencherTemplate = (templateId: string, fallback: string, extras: Record<string, string> = {}) => {
    let msg = templates[templateId] || fallback;

    // Obter lista formatada de planos VIPs cadastrados no banco (100% dinâmico e sincronizado com o painel!)
    if (msg.includes("{lista_planos}")) {
      msg = msg.replace(/{lista_planos}/g, obterPlanosVipFormatados(db));
    } else if (msg.includes("🏆 *Plano Corte Semanal GM:*")) {
      const regexBlocoPlanos = /🏆 \*Plano Corte Semanal GM:[\s\S]*?(?=🔑 \*Chave Pix|👉 \*Para assinar|━━━━━━━━━━━━━━━━━━━━)/;
      msg = msg.replace(regexBlocoPlanos, obterPlanosVipFormatados(db) + "\n\n");
    }

    // Obter lista formatada de serviços cadastrados no banco (100% dinâmico e real)
    if (msg.includes("{lista_servicos}")) {
      msg = msg.replace(/{lista_servicos}/g, obterCatalogoServicosFormatado(db));
    }

    // Obter serviços específicos de barba cadastrados no banco
    if (msg.includes("{servicos_barba}")) {
      msg = msg.replace(/{servicos_barba}/g, obterServicosBarbaFormatado(db));
    }

    // Obter procedimentos químicos cadastrados no banco
    if (msg.includes("{servicos_quimica}")) {
      msg = msg.replace(/{servicos_quimica}/g, obterServicosQuimicaFormatado(db));
    }

    // Obter lista formatada de barbeiros cadastrados no banco
    if (msg.includes("{lista_barbeiros}")) {
      const barbeirosRows: any[] = db.prepare("SELECT id, nome, telefone_whatsapp FROM barbeiros WHERE ativo = 1").all() || [];
      const listaB = barbeirosRows.map((b) => `👉 *${b.nome}* (digite *${b.nome.split(" ")[0]}*)`).join("\n");
      msg = msg.replace(/{lista_barbeiros}/g, listaB);
    }

    // Formatar detalhes inteligentes dos créditos (somente exibe o que o plano do cliente realmente possui!)
    let detalhesSaldo = "";
    if (mensalista) {
      const linhas: string[] = [];
      const cortes = Number(mensalista.cortes_restantes ?? 0);
      const barbas = Number(mensalista.barbas_restantes ?? 0);
      const sobrancelhas = Number(mensalista.sobrancelhas_restantes ?? 0);

      // Sempre exibe cortes se o plano for de corte ou tiver saldo
      if (cortes > 0 || (mensalista.cortes_cabelo_inclusos ?? 0) > 0 || (!barbas && !sobrancelhas)) {
        linhas.push(`✂️ *Cortes de Cabelo Restantes:* ${cortes}`);
      }

      // Somente exibe Barba se o plano incluir barba ou tiver saldo de barba
      if (barbas > 0 || (mensalista.barbas_inclusas ?? 0) > 0) {
        linhas.push(`🧔 *Barba Restante:* ${barbas}`);
      }

      // Somente exibe Sobrancelha se o plano incluir sobrancelha ou tiver saldo de sobrancelha
      if (sobrancelhas > 0 || (mensalista.inclui_sobrancelha ?? 0) > 0) {
        linhas.push(`✨ *Sobrancelha Restante:* ${sobrancelhas}`);
      }

      detalhesSaldo = linhas.join("\n");
    }

    // Limpar qualquer menção antiga de Barboterapia ou linhas vazias
    msg = msg.replace(/🧔 \*?Barboterapias? Restantes?:\*? \{?barbas\}?\n?/gi, "");
    msg = msg.replace(/✨ \*?Sobrancelhas? Restantes?:\*? \{?sobrancelhas\}?\n?/gi, "");
    msg = msg.replace(/barboterapia/gi, "barba");
    msg = msg.replace(/Barboterapia/g, "Barba");
    msg = msg.replace(/{detalhes_saldo}/g, detalhesSaldo);
    msg = msg.replace(/{detalhes_creditos}/g, detalhesSaldo);

    // Substituições Globais
    msg = msg
      .replace(/{cliente}/g, nomeCliente)
      .replace(/{barbearia}/g, barbearia)
      .replace(/{link_booksy}/g, linkBooksy)
      .replace(/{pix}/g, chavePix)
      .replace(/{endereco}/g, endereco)
      .replace(/{maps}/g, maps)
      .replace(/{horario}/g, horario)
      .replace(/{cortes}/g, String(mensalista?.cortes_restantes ?? 0))
      .replace(/{barbas}/g, String(mensalista?.barbas_restantes ?? 0))
      .replace(/{sobrancelhas}/g, String(mensalista?.sobrancelhas_restantes ?? 0))
      .replace(/{vencimento}/g, (() => {
        if (!mensalista?.data_vencimento) return "Sem plano ativo";
        const parts = String(mensalista.data_vencimento).split("-");
        return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(mensalista.data_vencimento);
      })())
      .replace(/{plano}/g, String(mensalista?.plano_nome ?? "VIP Mensalista"));

    // Substituições extras opcionais
    for (const [key, val] of Object.entries(extras)) {
      msg = msg.replace(new RegExp(`{${key}}`, "g"), val);
    }

    return msg;
  };

  // Helper seguro para envio de mensagem com simulação de digitação humana (Anti-Ban / Proteção Meta)
  const enviarRespostaHumanizada = async (textoResposta: string) => {
    try {
      let textoFinal = textoResposta;

      // 1. Simular status "digitando..." (composing)
      await sock.sendPresenceUpdate("composing", remoteJid);
      
      // 2. Tempo de digitação ágil e natural (1.2 a 3.5 segundos)
      const tempoDigitacao = Math.min(3500, Math.max(1200, Math.round(textoFinal.length * 10 + (Math.random() * 600 - 300))));
      await new Promise(r => setTimeout(r, tempoDigitacao));
      
      // 3. Pausa breve natural antes do envio (200ms a 400ms)
      await sock.sendPresenceUpdate("paused", remoteJid);
      await new Promise(r => setTimeout(r, 200 + Math.random() * 200));
      
      // 4. Enviar mensagem
      await enviarMensagemDoBot(remoteJid, { text: textoFinal });
    } catch (e) {
      console.error("Erro ao enviar mensagem:", e);
    }
  };

  // =========================================================================
  // FLUXO DE ROTEAMENTO DINÂMICO E TREINAMENTO DE RESPOSTAS
  // =========================================================================

  // SE O CLIENTE ENVIOU UM ÁUDIO:
  // Nunca envia o menu! Reconhece o áudio, avisa que a equipe vai ouvir e ativa a pausa humana!
  if (extraInfo?.ehAudio) {
    const respostaAudio = preencherTemplate(
      "msg_audio_recebido",
      `Fala parceiro! Recebemos seu áudio! 🎧\n\nJá notifiquei nossa equipe na *{barbearia}*. Como nossos barbeiros podem estar em atendimento na cadeira agora, vamos ouvir seu áudio e te responder aqui em instantes! 💈\n\n📲 Se for sobre agendamento, você também pode marcar direto no Booksy sem fila:\n👉 *{link_booksy}*`
    );
    await enviarRespostaHumanizada(respostaAudio);
    ativarPausaAtendimentoHumano(remoteJid, "Cliente enviou áudio", extraInfo?.pushName, numeroLimpo);
    return;
  }

  // SE O CLIENTE ENVIOU IMAGEM / COMPROVANTE (sem texto de comando):
  if (extraInfo?.ehImagem && !texto) {
    const respostaImagem = preencherTemplate(
      "msg_imagem_recebida",
      `Opa parceiro! Recebemos sua imagem / comprovante! 📸\n\nJá avisei nossa equipe aqui na *{barbearia}* para conferir. Em instantes confirmamos aqui para você! 💈`
    );
    await enviarRespostaHumanizada(respostaImagem);
    ativarPausaAtendimentoHumano(remoteJid, "Cliente enviou imagem / comprovante", extraInfo?.pushName, numeroLimpo);
    return;
  }

  // CANCELAMENTO / REMARCAÇÃO / AVISO DE ATRASO DE HORÁRIO
  if (
    texto.includes("cancelar") ||
    texto.includes("desmarcar") ||
    texto.includes("remarcar") ||
    texto.includes("trocar horario") ||
    texto.includes("trocar horário") ||
    texto.includes("mudar horario") ||
    texto.includes("mudar horário") ||
    texto.includes("nao vou conseguir") ||
    texto.includes("não vou conseguir") ||
    texto.includes("nao consigo ir") ||
    texto.includes("não consigo ir") ||
    texto.includes("nao poderei") ||
    texto.includes("não poderei") ||
    texto.includes("vou me atrasar") ||
    texto.includes("atraso") ||
    texto.includes("atrasar")
  ) {
    const resposta = preencherTemplate(
      "msg_cancelamento_aviso",
      `Tranquilo, *{cliente}*! Já avisamos a equipe da *{barbearia}* sobre o seu aviso de horário/cancelamento! 💈\n\nSe você agendou pelo Booksy, você também pode gerenciar ou reagendar facilmente por lá:\n👉 *{link_booksy}*\n\nEm instantes um dos nossos barbeiros vai confirmar com você aqui!`
    );
    await enviarRespostaHumanizada(resposta);
    ativarPausaAtendimentoHumano(remoteJid, "Cliente avisou sobre horário / cancelamento", extraInfo?.pushName, numeroLimpo);
    return;
  }

  // COMANDO #SAIR (CLIENTE CANCELA ESPERA E REATIVA O ROBÔ IMEDIATAMENTE)
  if (
    texto === "#sair" ||
    texto === "sair" ||
    texto === "#cancelar espera" ||
    texto === "cancelar espera" ||
    texto === "voltar pro bot" ||
    texto === "voltar para o bot"
  ) {
    removerPausaAtendimentoHumano(remoteJid);
    const resposta = preencherTemplate(
      "msg_robo_reativado_cliente",
      `🤖 *Atendimento Automático Retomado!* 💈\n\nCancelei a espera pelo barbeiro e estou de volta à sua disposição!\n\nComo posso te ajudar agora? Você pode perguntar sobre agendamento, valores dos serviços, localização ou digitar *#menu* para ver opções.`
    );
    await enviarRespostaHumanizada(resposta);
    return;
  }

  // COMANDO #MENU (EXIBE O MENU COMPLETO DE OPÇÕES E ATALHOS)
  if (
    texto === "#menu" ||
    texto === "menu" ||
    texto === "#opcoes" ||
    texto === "#opções" ||
    texto === "opcoes" ||
    texto === "opções" ||
    texto === "#ajuda"
  ) {
    removerPausaAtendimentoHumano(remoteJid);
    const resposta = preencherTemplate(
      "msg_menu_opcoes",
      `💈 *Menu de Atendimento - {barbearia}* 💈\n\nEscolha o que você precisa ou digite livremente sua dúvida:\n\n1️⃣ *Agendar Horário sem Fila (Booksy):*\n👉 {link_booksy}\n\n2️⃣ *Tabela de Preços & Serviços:*\nEnvie *preço* ou *serviços* para ver valores de corte, barba e químicas.\n\n3️⃣ *Planos Mensalistas VIP:*\nEnvie *planos* para conhecer nossos planos de corte semanal com desconto!\n\n4️⃣ *Endereço & Localização:*\nEnvie *endereço* ou *onde fica* para receber o mapa no GPS.\n\n5️⃣ *Horários de Funcionamento:*\nEnvie *horário* para consultar nosso horário de atendimento.\n\n6️⃣ *Chave Pix Oficial:*\nEnvie *pix* para ver os dados de pagamento.\n\n7️⃣ *Consultar seus Créditos (Mensalista):*\nEnvie *saldo* para consultar seus cortes restantes no mês.\n\n8️⃣ *Falar com a Equipe Humana:*\nEnvie *atendente* ou o nome do seu barbeiro (ex: *falar com Erick*).\n\n_💡 Você não precisa digitar números, basta escrever o que deseja que te respondo na hora!_`
    );
    await enviarRespostaHumanizada(resposta);
    return;
  }

  // COMANDO #INICIAR (ASSUMIR ATENDIMENTO / PAUSAR O ROBÔ NESTA CONVERSA)
  if (texto === "#iniciar" || texto === "#pausar") {
    ativarPausaAtendimentoHumano(remoteJid, "Atendimento humano assumido via #iniciar", extraInfo?.pushName, numeroLimpo);
    const resposta = preencherTemplate(
      "msg_humano_assumiu",
      `👨‍💼 *Atendimento Iniciado:* Nosso profissional da equipe *{barbearia}* acabou de assumir a conversa e falará diretamente com você a partir de agora! 💈`
    );
    await enviarRespostaHumanizada(resposta);
    return;
  }

  // COMANDO #ATIVAR (REATIVAR ROBÔ NESTA CONVERSA)
  if (texto === "#ativar" || texto === "#reativar") {
    removerPausaAtendimentoHumano(remoteJid);
    const resposta = preencherTemplate(
      "msg_fim_atendimento",
      `🤖 *Atendimento Automático Reativado!* O assistente virtual voltou a atender esta conversa normalmente. Se precisar de algo, estamos à disposição! 💈`
    );
    await enviarRespostaHumanizada(resposta);
    return;
  }

  // VERIFICAÇÃO SE O CLIENTE CITOU OU ESCOLHEU UM BARBEIRO ESPECÍFICO
  const barbeirosAtivos: any[] = db.prepare("SELECT * FROM barbeiros WHERE ativo = 1").all() || [];
  for (const b of barbeirosAtivos) {
    const nomeLower = String(b.nome || "").toLowerCase().trim();
    const primeiroNome = nomeLower.split(" ")[0];
    if (
      texto === nomeLower ||
      texto === primeiroNome ||
      texto.includes(`barbeiro ${primeiroNome}`) ||
      texto.includes(`com o ${primeiroNome}`) ||
      texto.includes(`com a ${primeiroNome}`) ||
      texto.includes(`com ${primeiroNome}`) ||
      texto.includes(`atendimento com ${primeiroNome}`) ||
      texto.includes(`falar com ${primeiroNome}`) ||
      texto.includes(`agendar com ${primeiroNome}`)
    ) {
      let telBarbeiro = String(b.telefone_whatsapp || "").replace(/\D/g, "");
      if (telBarbeiro.length >= 10 && !telBarbeiro.startsWith("55")) {
        telBarbeiro = "55" + telBarbeiro;
      }

      if (telBarbeiro.length >= 12) {
        const jidBarbeiro = `${telBarbeiro}@s.whatsapp.net`;
        const msgAlertaBarbeiro = preencherTemplate(
          "msg_alerta_barbeiro",
          `🔔 *Aviso de Atendimento - ${b.nome}*\n\nO cliente *${nomeCliente}* (Tel: *${telefoneRealCliente}*) acabou de solicitar atendimento com você pelo WhatsApp da barbearia!\n\nAcesse o chat dele para dar sequência no atendimento assim que puder. 💈`,
          {
            nome_barbeiro: b.nome,
            cliente: nomeCliente,
            telefone_cliente: telefoneRealCliente
          }
        );

        try {
          await enviarMensagemDoBot(jidBarbeiro, { text: msgAlertaBarbeiro });
          console.log(`[BOT] Notificação privada disparada para o barbeiro ${b.nome} (${jidBarbeiro})`);
        } catch (errB) {
          console.error(`[BOT] Erro ao enviar notificação privada ao barbeiro ${b.nome}:`, errB);
        }
      }

      await enviarRespostaHumanizada(
        `Perfeito, *${nomeCliente}*! Acabei de mandar um aviso particular no WhatsApp do *${b.nome}* avisando que você quer falar com ele! 💈📲\n\nAssim que ele liberar a cadeira, ele responderá aqui.\n\nSe preferir agendar no Booksy para garantir seu horário sem fila:\n👉 *${linkBooksy}*`
      );
      ativarPausaAtendimentoHumano(remoteJid, `Cliente solicitou atendimento com o barbeiro ${b.nome}`, extraInfo?.pushName, numeroLimpo);
      return;
    }
  }

  // =========================================================================
  // ATENDIMENTO INTELIGENTE COM IA (GOOGLE GEMINI FLASH)
  // Se a IA estiver ativa e com chave configurada, ela assume o atendimento
  // com respostas ultra-curtas, humanizadas e naturais baseadas nos dados da barbearia.
  // =========================================================================
  if (config.gemini_ativo && config.gemini_api_key && String(config.gemini_api_key).trim().length > 10) {
    const respostaIa = await gerarRespostaGemini(texto, remoteJid, nomeCliente);
    if (respostaIa && respostaIa.trim().length > 0) {
      await enviarRespostaHumanizada(respostaIa);
      return;
    }
  }

  // 1. AGENDAMENTO NO BOOKSY (Palavras-chave: agendar, marcar, horário, vaga, Booksy)
  if (
    texto === "1" ||
    texto.includes("agendar") ||
    texto.includes("marcar") ||
    texto.includes("agendamento") ||
    texto.includes("marcar horario") ||
    texto.includes("marcar horário") ||
    texto.includes("marcar um corte") ||
    texto.includes("marcar corte") ||
    texto.includes("cortar cabelo") ||
    texto.includes("cortar o cabelo") ||
    texto.includes("fazer cabelo") ||
    texto.includes("vaga") ||
    texto.includes("vagas") ||
    texto.includes("booksy")
  ) {
    const resposta = preencherTemplate(
      "msg_booksy",
      `Top, *${nomeCliente}*! Para agendar sem fila e escolher seu barbeiro favorito, acesse o link oficial do nosso Booksy:\n\n👉 *{link_booksy}*\n\n✅ Escolha o profissional e o serviço\n✅ Selecione o dia e horário que melhor se encaixam pra você\n✅ Confirmação instantânea no seu celular!\n\nTe esperamos na cadeira da *{barbearia}*! ✂️🔥`
    );
    await enviarRespostaHumanizada(resposta);
    return;
  }

  // 2. TABELA DE SERVIÇOS & PREÇOS (Palavras-chave: preço, valor, quanto custa, tabela, catálogo)
  if (
    texto === "2" ||
    texto.includes("preco") ||
    texto.includes("preço") ||
    texto.includes("precos") ||
    texto.includes("preços") ||
    texto.includes("quanto custa") ||
    texto.includes("quanto e") ||
    texto.includes("quanto é") ||
    texto.includes("tabela") ||
    texto.includes("valor") ||
    texto.includes("valores") ||
    texto.includes("servico") ||
    texto.includes("serviço") ||
    texto.includes("servicos") ||
    texto.includes("serviços") ||
    texto.includes("catalogo") ||
    texto.includes("catálogo")
  ) {
    const resposta = preencherTemplate(
      "msg_servicos",
      `📋 *Tabela de Serviços & Valores - {barbearia}:* 💈\n\n{lista_servicos}\n\n📲 *Agende seu horário sem fila no Booksy:*\n👉 *{link_booksy}*\n\n🔑 *Chave Pix Oficial:* *{pix}*`
    );
    await enviarRespostaHumanizada(resposta);
    return;
  }

  // 3. ENDEREÇO & LOCALIZAÇÃO (Palavras-chave: onde fica, endereço, localização, como chegar, maps)
  if (
    texto === "5" ||
    texto.includes("onde fica") ||
    texto.includes("endereco") ||
    texto.includes("endereço") ||
    texto.includes("localizacao") ||
    texto.includes("localização") ||
    texto.includes("local") ||
    texto.includes("como chegar") ||
    texto.includes("qual a rua") ||
    texto.includes("qual o bairro") ||
    texto.includes("maps") ||
    texto.includes("waze") ||
    texto.includes("gps")
  ) {
    let lat: number | null = (config.latitude !== null && config.latitude !== undefined && config.latitude !== "") ? Number(config.latitude) : null;
    let lng: number | null = (config.longitude !== null && config.longitude !== undefined && config.longitude !== "") ? Number(config.longitude) : null;

    if ((lat === null || lng === null || isNaN(lat) || isNaN(lng)) && config.link_google_maps) {
      const extraido = extrairCoordenadas(config.link_google_maps);
      if (extraido) {
        lat = extraido.lat;
        lng = extraido.lng;
      }
    }

    if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
      try {
        await new Promise(r => setTimeout(r, 1200 + Math.random() * 500));
        await enviarMensagemDoBot(remoteJid, {
          location: {
            degreesLatitude: lat,
            degreesLongitude: lng,
            name: barbearia,
            address: endereco,
            url: maps
          }
        });
        await new Promise(r => setTimeout(r, 800 + Math.random() * 400));
      } catch (locErr) {
        console.error("Erro ao enviar card de localização GPS:", locErr);
      }
    }

    const resposta = preencherTemplate(
      "msg_localizacao_pix",
      `📍 *Endereço da Barbearia:*\n{endereco}\n\n🗺️ *Link direto no Google Maps / Waze:*\n{maps}\n\n⏰ *Horário de Funcionamento:*\n{horario}\n\n📲 *Agende seu horário sem fila no Booksy:*\n👉 *{link_booksy}*`
    );
    await enviarRespostaHumanizada(resposta);
    return;
  }

  // 4. PIX & FORMAS DE PAGAMENTO (Palavras-chave: pix, chave pix, pagamento, pagar, cartão, dinheiro)
  if (
    texto.includes("pix") ||
    texto.includes("chave pix") ||
    texto.includes("pagamento") ||
    texto.includes("pagar") ||
    texto.includes("forma de pagamento") ||
    texto.includes("formas de pagamento") ||
    texto.includes("cartao") ||
    texto.includes("cartão") ||
    texto.includes("debito") ||
    texto.includes("débito") ||
    texto.includes("credito") ||
    texto.includes("crédito") ||
    texto.includes("dinheiro")
  ) {
    const resposta = preencherTemplate(
      "msg_pagamentos",
      `💳 *Formas de Pagamento Aceitas - {barbearia}:*\n\nAceitamos Pix, cartões de débito/crédito e dinheiro! 💵\n\n🔑 *Chave Pix Oficial da Barbearia:* *{pix}*\n\n_(Caso seja pagamento de corte ou assinatura, por favor envie o comprovante com seu nome aqui no chat!)_`
    );
    await enviarRespostaHumanizada(resposta);
    return;
  }

  // 5. HORÁRIOS DE ATENDIMENTO / FUNCIONAMENTO (Palavras-chave: horário, que horas, abre, fecha, tá aberto)
  if (
    texto === "6" ||
    texto === "8" ||
    texto.includes("horario de funcionamento") ||
    texto.includes("horário de funcionamento") ||
    texto.includes("horario de atendimento") ||
    texto.includes("horário de atendimento") ||
    texto.includes("que horas") ||
    texto.includes("abre") ||
    texto.includes("fecha") ||
    texto.includes("ta aberto") ||
    texto.includes("tá aberto") ||
    texto.includes("funciona ate") ||
    texto.includes("funciona até")
  ) {
    const resposta = preencherTemplate(
      "msg_horarios",
      `⏰ *Horários de Atendimento da {barbearia}:*\n\n{horario}\n\n📲 *Agende seu horário 24h pelo Booksy:*\n👉 *{link_booksy}*`
    );
    await enviarRespostaHumanizada(resposta);
    return;
  }

  // 6. PLANOS VIPS & CLUBE DE ASSINATURA (Palavras-chave: plano, planos, mensal, mensalista, clube, assinatura)
  if (
    texto.includes("plano") ||
    texto.includes("planos") ||
    texto.includes("clube") ||
    texto.includes("assinatura") ||
    texto.includes("mensal") ||
    texto.includes("mensalista") ||
    texto.includes("pacote") ||
    texto.includes("pacotes")
  ) {
    const resposta = preencherTemplate(
      "msg_planos_vip",
      `👑 *Conheça o Clube de Assinatura VIP da {barbearia}!* 💈\n\nCorte o cabelo toda semana e economize até 40% no mês! Vantagens exclusivas:\n\n{lista_planos}\n\n🔑 *Chave Pix Oficial para Assinaturas:* *{pix}*\n_(Após transferir, envie o comprovante com seu nome aqui no chat)_`
    );
    await enviarRespostaHumanizada(resposta);
    return;
  }

  // 7. CONSULTA DE CRÉDITOS DO MENSALISTA VIP (Palavras-chave: saldo, crédito, quantos cortes me restam)
  if (
    texto === "4" ||
    texto.includes("saldo") ||
    texto.includes("crédito") ||
    texto.includes("credito") ||
    texto.includes("quantos cortes") ||
    texto.includes("meus cortes") ||
    texto.includes("me resta") ||
    texto.includes("minha assinatura")
  ) {
    if (mensalista) {
      const resposta = preencherTemplate(
        "msg_consulta_mensalista",
        `Fala *${nomeCliente}*! Consultamos seu plano VIP aqui no sistema: 👑\n\n📌 *Seu Plano:* {plano}\n{detalhes_saldo}\n📅 *Validade do seu Ciclo:* {vencimento}\n\nAproveite seus benefícios e agende pelo Booksy:\n👉 *{link_booksy}*\n\n🔑 *Chave Pix para Renovação do Ciclo:* *{pix}*`
      );
      await enviarRespostaHumanizada(resposta);
    } else {
      await enviarRespostaHumanizada(
        `Opa, *${nomeCliente}*! Não identificamos uma assinatura VIP ativa vinculada ao seu número de WhatsApp.\n\nQuer cortar o cabelo toda semana e economizar no mês? Conheça nossos Planos VIPs:\n\n${obterPlanosVipFormatados(db)}\n\n🔑 *Chave Pix:* *${chavePix}*`
      );
    }
    return;
  }

  // 8. SERVIÇOS DE BARBA & BARBOTERAPIA
  if (texto === "barba" || texto.includes("fazer barba") || texto.includes("fazer a barba") || texto.includes("aparar barba") || texto.includes("barboterapia")) {
    const resposta = preencherTemplate(
      "msg_barba_terapia",
      `🧔 *Serviços de Barba na {barbearia}:*\n\n{servicos_barba}\n\n📲 *Agende seu horário sem fila no Booksy:*\n👉 *{link_booksy}*`
    );
    await enviarRespostaHumanizada(resposta);
    return;
  }

  // 9. PROCEDIMENTOS QUÍMICOS / LUZES / PLATINADO
  if (
    texto === "3" ||
    texto.includes("quimica") ||
    texto.includes("química") ||
    texto.includes("platinado") ||
    texto.includes("nevou") ||
    texto.includes("nevar") ||
    texto.includes("luzes") ||
    texto.includes("progressiva") ||
    texto.includes("botox") ||
    texto.includes("selagem") ||
    texto.includes("relaxamento")
  ) {
    const resposta = preencherTemplate(
      "msg_quimicas",
      `⚡ *Procedimentos Químicos & Colorações da {barbearia}:*\n\n{servicos_quimica}\n\n⚠️ *Para procedimentos químicos, recomendamos agendar com antecedência pelo Booksy:*\n👉 *{link_booksy}*`
    );
    await enviarRespostaHumanizada(resposta);
    return;
  }

  // 10. CORTE INFANTIL / KIDS
  if (texto.includes("infantil") || texto.includes("criança") || texto.includes("crianca") || texto.includes("kids") || texto.includes("filho") || texto.includes("menino")) {
    const resposta = preencherTemplate(
      "msg_cortes_infantis",
      `👶 *Cortes Infantis / Kids na {barbearia}:*\n\nTemos todo o cuidado e paciência para atender a criançada no melhor estilo!\n\n📲 *Agende seu horário pelo Booksy:*\n👉 *{link_booksy}*`
    );
    await enviarRespostaHumanizada(resposta);
    return;
  }

  // 11. LISTA DE BARBEIROS DA EQUIPE
  if (
    texto.includes("barbeiro") ||
    texto.includes("equipe") ||
    texto.includes("profissionais") ||
    texto.includes("quem atende")
  ) {
    const resposta = preencherTemplate(
      "msg_escolha_barbeiro",
      `Com qual dos nossos profissionais você deseja ser atendido hoje? Digite o nome do barbeiro:\n\n{lista_barbeiros}\n\nAssim que você disser o nome, notificamos o barbeiro diretamente no WhatsApp dele! 💈📲`
    );
    await enviarRespostaHumanizada(resposta);
    return;
  }

  // 12. FALAR COM ATENDENTE HUMANO
  if (
    texto === "7" ||
    texto === "9" ||
    texto.includes("humano") ||
    texto.includes("atendente") ||
    texto.includes("pessoa") ||
    texto.includes("iniciar atendimento") ||
    texto.includes("falar com alguem") ||
    texto.includes("falar com alguém") ||
    texto.includes("falar com uma pessoa") ||
    texto.includes("falar com atendente")
  ) {
    const resposta = preencherTemplate(
      "msg_atendimento_humano",
      `Perfeito, *${nomeCliente}*! Já notificamos nossa equipe na *{barbearia}*. 👨‍💼\n\nComo nossos barbeiros podem estar em atendimento na cadeira agora, responderemos aqui em poucos minutos!\n\nSe for sobre agendamento, você também pode marcar direto no Booksy sem fila:\n👉 *{link_booksy}*`
    );
    await enviarRespostaHumanizada(resposta);
    ativarPausaAtendimentoHumano(remoteJid, "Cliente solicitou atendente humano", extraInfo?.pushName, numeroLimpo);
    return;
  }

  // 13. GATILHOS PERSONALIZADOS CADASTRADOS NO PAINEL
  for (const mRow of msgsRows) {
    if (mRow.gatilho && mRow.ativo !== 0) {
      const palavras = String(mRow.gatilho).split(",").map((p: string) => p.trim().toLowerCase()).filter(Boolean);
      const combinou = palavras.some((p: string) => texto === p || texto.includes(p));
      if (combinou) {
        const resposta = preencherTemplate(mRow.id, mRow.mensagem);
        await enviarRespostaHumanizada(resposta);
        return;
      }
    }
  }

  // 14. SAUDAÇÃO PURA (DISPARADA QUANDO O CLIENTE DIZ "OI", "OLÁ", "BOM DIA", SEM OUTRA PERGUNTA)
  const saudacoesPuras = [
    "0", "oi", "ola", "olá", "oie", "opa", "salve", "fala", "e ai", "e aí", "eai", 
    "bom dia", "boa tarde", "boa noite", "tudo bem", "td bem", "menu", "início", "inicio", 
    "voltar", "comecar", "começar", "#menu", "#bot"
  ];
  if (saudacoesPuras.includes(texto)) {
    const fallbackBoasVindas = `Fala parceiro! Seja muito bem-vindo à *{barbearia}*! 💈✂️\n\nComo posso te ajudar hoje?`;
    const resposta = preencherTemplate("msg_boas_vindas", fallbackBoasVindas);
    await enviarRespostaHumanizada(resposta);
    return;
  }

  // Se o texto for vazio (sem áudio nem mídia), encerra
  if (!texto) {
    return;
  }

  // 15. DEFAULT: SE NÃO FOI SAUDAÇÃO NEM PALAVRA-CHAVE CONHECIDA (MENSAGEM LIVRE / DÚVIDA)
  // Encaminha amigavelmente para a equipe e pausa o robô para atendimento humano
  const respostaDuvida = preencherTemplate(
    "msg_duvida_humano",
    `Opa parceiro! 💈 Recebemos sua mensagem!\n\nJá notifiquei a equipe da *{barbearia}*. Em instantes um dos nossos barbeiros vai te responder aqui diretamente! 👨‍💼\n\n📲 Se quiser adiantar e garantir seu horário no Booksy sem fila:\n👉 *{link_booksy}*`
  );
  await enviarRespostaHumanizada(respostaDuvida);
  ativarPausaAtendimentoHumano(remoteJid, "Cliente enviou mensagem livre / dúvida", extraInfo?.pushName, numeroLimpo);
}
