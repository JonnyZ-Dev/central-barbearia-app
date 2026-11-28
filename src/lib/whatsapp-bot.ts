import path from "path";
import fs from "fs";
import QRCode from "qrcode";
import pino from "pino";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadMediaMessage
} from "@whiskeysockets/baileys";
import { NodeCache } from "@cacheable/node-cache";
import { getDb } from "./db";
import {
  gerarRespostaGemini,
  transcreverAudioComGemini,
  gerarRespostaGeminiComAudio,
  limparHistoricoChat
} from "./gemini";
import { iniciarAgendadorSincronizacaoBooksy } from "./booksy-sync";

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
  rawMsg?: any;
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

// Sistema Anti-Spam de Duas Pontas para Alertas de Barbeiros:
// 1. Por cliente: mesmo número só pode disparar alerta a cada 5 minutos (evita trolls de 1 número)
// 2. Por barbeiro: o profissional recebe no máximo 5 alertas por hora (proteção contra múltiplos chips)
const ultimosAlertasPorCliente = new Map<string, number>();
const ultimosAlertasPorBarbeiro = new Map<string, number[]>();
const INTERVALO_COOLDOWN_CLIENTE_MS = 5 * 60 * 1000; // 5 minutos
const MAX_ALERTAS_HORA_BARBEIRO = 5; // Máximo 5 alertas por hora por barbeiro
const JANELA_HORA_BARBEIRO_MS = 60 * 60 * 1000; // 1 hora

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

// Helper para reativação antecipada manual da IA durante atendimento humano
function ehComandoReativarBot(texto: string): boolean {
  const t = (texto || "").trim().toLowerCase();
  if (!t) return false;
  return t === "/ia" || t === "/retomar" || t === "/liberar" || t === "#ativar" || t === "#reativar";
}

// Normaliza o remoteJid do WhatsApp/Baileys removendo sufixos de dispositivo (:1, :2) e padronizando @s.whatsapp.net
export function normalizarRemoteJid(jid: string): string {
  if (!jid) return "";
  let j = jid.trim();
  if (j.endsWith("@g.us") || j.endsWith("@broadcast")) return j;

  // Se for apenas dígitos numéricos, adiciona o sufixo padrão
  if (/^\d+$/.test(j)) {
    j = `${j}@s.whatsapp.net`;
  }

  // Remove sufixo de multi-device (:1, :2, etc)
  j = j.replace(/:[0-9]+@/, "@");

  // Padroniza @c.us para @s.whatsapp.net
  j = j.replace("@c.us", "@s.whatsapp.net");

  return j;
}

// Extrai texto limpo e tipo de qualquer formato de mensagem do Baileys (inclusive efêmeras, viewOnce, mídias)
export function extrairTextoEInfoMensagem(msg: any): { texto: string; tipo: "texto" | "audio" | "imagem" | "video" | "documento" } {
  if (!msg) return { texto: "", tipo: "texto" };

  let m = msg.message || msg;
  // Desembrulha mensagens aninhadas (efêmeras, viewOnce, documento com legenda)
  while (m?.ephemeralMessage?.message || m?.viewOnceMessage?.message || m?.viewOnceMessageV2?.message || m?.documentWithCaptionMessage?.message) {
    m = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message || m.documentWithCaptionMessage?.message;
  }

  let tipo: "texto" | "audio" | "imagem" | "video" | "documento" = "texto";
  if (m?.audioMessage) tipo = "audio";
  else if (m?.imageMessage) tipo = "imagem";
  else if (m?.videoMessage) tipo = "video";
  else if (m?.documentMessage) tipo = "documento";

  const texto = (
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    m?.documentMessage?.caption ||
    (m?.audioMessage ? "🎙️ [Áudio do WhatsApp]" : "") ||
    (m?.imageMessage ? "📷 [Imagem / Foto]" : "") ||
    (m?.videoMessage ? "🎥 [Vídeo]" : "") ||
    ""
  ).trim();

  return { texto, tipo };
}

// Registra cada mensagem individual (do cliente, da IA ou do barbeiro) na tabela historico_mensagens
export function registrarMensagemNoHistorico(
  remoteJid: string,
  numero: string,
  remetente: "CLIENTE" | "IA" | "HUMANO",
  nome: string,
  texto: string,
  tipo: "texto" | "audio" | "imagem" | "video" | "documento" = "texto",
  timestamp?: number
) {
  try {
    if (!remoteJid || !texto) return;
    const db = getDb();
    const agora = timestamp || Date.now();
    const id = `msg_${agora}_${Math.random().toString(36).slice(2, 8)}`;
    const dataHora = new Date(agora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const numLimpo = (numero || remoteJid).replace(/\D/g, "");

    db.prepare(`
      INSERT INTO historico_mensagens (id, remote_jid, numero, remetente, nome, texto, tipo, criado_em, data_hora)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, remoteJid, numLimpo, remetente, nome || "", texto, tipo, agora, dataHora);
  } catch (err: any) {
    console.warn("[HISTORICO MSG] Erro ao registrar mensagem:", err.message);
  }
}

// Busca histórico completo de mensagens de um chat para visualização estilo WhatsApp no Dashboard
export function buscarHistoricoMensagens(remoteJid: string, numero?: string) {
  try {
    const db = getDb();
    const numLimpo = (numero || remoteJid).replace(/\D/g, "");
    const ultimos8 = numLimpo.length >= 8 ? numLimpo.slice(-8) : numLimpo;

    const mapaMsgs = new Map<string, any>();

    // 1. Consulta mensagens gravadas na tabela historico_mensagens
    const msgs: any[] = db.prepare(`
      SELECT * FROM historico_mensagens 
      WHERE remote_jid = ? 
         OR numero = ? 
         OR (? != '' AND numero LIKE '%' || ? || '%')
         OR (? != '' AND remote_jid LIKE '%' || ? || '%')
      ORDER BY criado_em ASC
      LIMIT 200
    `).all(remoteJid, numLimpo, ultimos8, ultimos8, ultimos8, ultimos8) || [];

    for (const m of msgs) {
      const chave = `${m.remetente}_${(m.texto || "").trim()}_${m.criado_em}`;
      mapaMsgs.set(m.id || chave, m);
    }

    // 2. Mescla com mensagens salvas em bot_mensagens_cache que ainda não estejam no histórico
    try {
      const cacheRows: any[] = db.prepare(`
        SELECT * FROM bot_mensagens_cache 
        WHERE remote_jid = ? OR remote_jid LIKE ?
        ORDER BY criado_em ASC
        LIMIT 100
      `).all(remoteJid, `%${ultimos8}%`) || [];

      for (const row of cacheRows) {
        try {
          const parsed = JSON.parse(row.message_json);
          const { texto, tipo } = extrairTextoEInfoMensagem(parsed);
          if (texto) {
            // Em bot_mensagens_cache, se não for fromMe explícito, é CLIENTE
            const remetente = (parsed?.key?.fromMe || parsed?.fromMe) ? "HUMANO" : "CLIENTE";
            
            // Deduplicação: verifica se já temos mensagem idêntica em até 2 minutos
            let jaExiste = false;
            for (const existente of mapaMsgs.values()) {
              if (existente.texto === texto && Math.abs(Number(existente.criado_em) - Number(row.criado_em)) < 120000) {
                jaExiste = true;
                break;
              }
            }

            if (!jaExiste) {
              const dataHora = new Date(row.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
              const item = {
                id: `cache_${row.id}`,
                remote_jid: remoteJid,
                numero: numLimpo,
                remetente,
                nome: remetente === "HUMANO" ? "Barbeiro" : (parsed?.pushName || "Cliente"),
                texto,
                tipo,
                criado_em: row.criado_em,
                data_hora: dataHora
              };
              mapaMsgs.set(item.id, item);

              // Grava também no historico_mensagens para persistência permanente!
              try {
                db.prepare(`
                  INSERT OR IGNORE INTO historico_mensagens (id, remote_jid, numero, remetente, nome, texto, tipo, criado_em, data_hora)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(item.id, remoteJid, numLimpo, remetente, item.nome, texto, tipo, row.criado_em, dataHora);
              } catch (e) {}
            }
          }
        } catch (e) {}
      }
    } catch (e) {}

    // 3. Fallback complementar de conversas_whatsapp
    try {
      const conv: any = db.prepare("SELECT * FROM conversas_whatsapp WHERE remote_jid = ? OR numero = ?").get(remoteJid, numLimpo);
      if (conv && conv.ultima_mensagem) {
        let jaExiste = false;
        for (const existente of mapaMsgs.values()) {
          if (existente.texto === conv.ultima_mensagem) {
            jaExiste = true;
            break;
          }
        }
        if (!jaExiste) {
          const dataHora = new Date(conv.atualizado_em || Date.now()).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          mapaMsgs.set(`conv_${conv.atualizado_em}`, {
            id: `conv_${conv.atualizado_em}`,
            remote_jid: remoteJid,
            numero: numLimpo,
            remetente: conv.ultimo_remetente || "CLIENTE",
            nome: conv.nome || "Cliente",
            texto: conv.ultima_mensagem,
            tipo: conv.ultima_mensagem.includes("🎙️") ? "audio" : (conv.ultima_mensagem.includes("📷") ? "imagem" : "texto"),
            criado_em: conv.atualizado_em || Date.now(),
            data_hora: dataHora
          });
        }
      }
    } catch (e) {}

    // Retorna ordenado em ordem cronológica (criado_em ASC)
    const todas = Array.from(mapaMsgs.values());
    todas.sort((a, b) => (Number(a.criado_em) || 0) - (Number(b.criado_em) || 0));
    return todas;
  } catch (err: any) {
    console.error("[HISTORICO MSG] Erro ao buscar histórico:", err.message);
    return [];
  }
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

    // Grava no histórico permanente de mensagens
    const textoMsg = content?.text || (typeof content === "string" ? content : "");
    if (textoMsg) {
      const jidDestino = sent.key.remoteJid || jid;
      registrarMensagemNoHistorico(
        jidDestino,
        jidDestino.replace(/\D/g, ""),
        "IA",
        "Elaine.IA",
        textoMsg,
        "texto"
      );
    }
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

export function registrarAtividadeConversa(
  remoteJid: string,
  dados: {
    numero?: string;
    nome?: string;
    ultimaMensagem?: string;
    ultimoRemetente?: "CLIENTE" | "HUMANO" | "IA";
    status?: "IA" | "HUMANO";
    motivoPausa?: string;
  }
) {
  try {
    const db = getDb();
    const agora = Date.now();
    const jidNormalizado = normalizarRemoteJid(remoteJid);
    const numeroLimpo = dados.numero || jidNormalizado.replace(/[^0-9]/g, "");
    const ultimos8 = numeroLimpo.length >= 8 ? numeroLimpo.slice(-8) : numeroLimpo;
    const nome = dados.nome || null;
    const msg = dados.ultimaMensagem || null;
    const remetente = dados.ultimoRemetente || "CLIENTE";
    const status = dados.status || "IA";
    const motivo = dados.motivoPausa || null;

    // Localiza se já existe uma linha desta mesma conversa (por JID ou pelos últimos 8 dígitos)
    const convExistente: any = db.prepare(`
      SELECT remote_jid, ultima_mensagem FROM conversas_whatsapp 
      WHERE remote_jid = ? 
         OR numero = ? 
         OR (? != '' AND (numero LIKE '%' || ? || '%' OR remote_jid LIKE '%' || ? || '%'))
      LIMIT 1
    `).get(jidNormalizado, numeroLimpo, ultimos8, ultimos8, ultimos8);

    const jidAlvo = convExistente?.remote_jid || jidNormalizado;

    // Se a mensagem enviada for um placeholder genérico e já tínhamos uma mensagem real anterior, preserva a mensagem real
    let msgFinal = msg;
    if (msg?.startsWith("(Atendimento") && convExistente?.ultima_mensagem && !convExistente.ultima_mensagem.startsWith("(Atendimento")) {
      msgFinal = convExistente.ultima_mensagem;
    }

    db.prepare(`
      INSERT INTO conversas_whatsapp (remote_jid, numero, nome, ultima_mensagem, ultimo_remetente, status, motivo_pausa, atualizado_em, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(remote_jid) DO UPDATE SET
        numero = excluded.numero,
        nome = CASE WHEN excluded.nome IS NOT NULL AND excluded.nome != '' THEN excluded.nome ELSE conversas_whatsapp.nome END,
        ultima_mensagem = CASE WHEN excluded.ultima_mensagem IS NOT NULL AND excluded.ultima_mensagem != '' THEN excluded.ultima_mensagem ELSE conversas_whatsapp.ultima_mensagem END,
        ultimo_remetente = excluded.ultimo_remetente,
        status = excluded.status,
        motivo_pausa = excluded.motivo_pausa,
        atualizado_em = excluded.atualizado_em
    `).run(jidAlvo, numeroLimpo, nome, msgFinal, remetente, status, motivo, agora, agora);
  } catch (err: any) {
    console.error("[CONVERSAS] Erro ao registrar atividade:", err.message);
  }
}

export function listarConversasCompletas() {
  try {
    const db = getDb();
    const agora = Date.now();

    // 1. Limpeza preventiva de duplicatas históricas no banco SQLite:
    // Mantém apenas 1 registro por cliente (últimos 8 dígitos), priorizando mensagem real e data mais recente
    try {
      db.prepare(`
        DELETE FROM conversas_whatsapp 
        WHERE remote_jid NOT IN (
          SELECT remote_jid FROM (
            SELECT remote_jid, ROW_NUMBER() OVER (
              PARTITION BY CASE 
                WHEN LENGTH(REPLACE(REPLACE(numero, '-', ''), ' ', '')) >= 8 
                THEN SUBSTR(REPLACE(REPLACE(numero, '-', ''), ' ', ''), -8)
                ELSE remote_jid 
              END 
              ORDER BY 
                CASE WHEN ultima_mensagem LIKE '(Atendimento%' THEN 1 ELSE 0 END ASC,
                atualizado_em DESC
            ) as rn
            FROM conversas_whatsapp
          ) WHERE rn = 1
        )
      `).run();
    } catch (e) {}

    const rows: any[] = db.prepare("SELECT * FROM conversas_whatsapp ORDER BY atualizado_em DESC LIMIT 150").all() || [];

    // 2. Mapa deduplicado em memória indexado pelos últimos 8 dígitos do telefone
    const mapaConversas = new Map<string, any>();

    for (const r of rows) {
      const numLimpo = (r.numero || r.remote_jid || "").replace(/\D/g, "");
      const chaveCliente = numLimpo.length >= 8 ? numLimpo.slice(-8) : (r.remote_jid || r.numero);
      if (!chaveCliente) continue;

      if (!mapaConversas.has(chaveCliente)) {
        mapaConversas.set(chaveCliente, { ...r });
      } else {
        const existente = mapaConversas.get(chaveCliente);
        // Prefere mensagem de texto real a placeholders de atendimento
        const prefereTextoAtual = (!r.ultima_mensagem?.startsWith("(Atend") && existente.ultima_mensagem?.startsWith("(Atend"));
        if (prefereTextoAtual || Number(r.atualizado_em) > Number(existente.atualizado_em)) {
          mapaConversas.set(chaveCliente, {
            ...existente,
            ...r,
            ultima_mensagem: prefereTextoAtual ? r.ultima_mensagem : (existente.ultima_mensagem || r.ultima_mensagem)
          });
        }
      }
    }

    // 3. Atualiza estado de atendimento humano do cache SEM duplicar cartões
    for (const [jid, cacheItem] of atendimentosHumanosCache.entries()) {
      if (cacheItem.expiraEm <= agora) continue;

      const numLimpo = (cacheItem.numero || jid).replace(/\D/g, "");
      const chaveCliente = numLimpo.length >= 8 ? numLimpo.slice(-8) : jid;
      if (!chaveCliente) continue;

      if (mapaConversas.has(chaveCliente)) {
        // Já existe a conversa deste cliente: apenas atualiza o status para HUMANO
        const existente = mapaConversas.get(chaveCliente);
        existente.status = "HUMANO";
        existente.motivo_pausa = cacheItem.motivo || existente.motivo_pausa || "Atendimento assumido";
      } else {
        // Cliente em atendimento humano que ainda não estava na tabela conversas_whatsapp
        const jidValido = jid.includes("@") ? normalizarRemoteJid(jid) : `${numLimpo}@s.whatsapp.net`;
        mapaConversas.set(chaveCliente, {
          remote_jid: jidValido,
          numero: cacheItem.numero || numLimpo,
          nome: cacheItem.nome || "Cliente em Atendimento",
          ultima_mensagem: "(Atendimento humano em andamento)",
          ultimo_remetente: "HUMANO",
          status: "HUMANO",
          motivo_pausa: cacheItem.motivo || "Atendimento assumido",
          atualizado_em: agora,
          criado_em: agora
        });
      }
    }

    // 4. Formata a lista final com cálculo exato de tempo restante da Elaine.IA
    const listaFinal = Array.from(mapaConversas.values()).map(r => {
      const jidNorm = normalizarRemoteJid(r.remote_jid);
      const estaPausado = verificarAtendimentoHumanoAtivo(jidNorm);
      const numLimpo = (r.numero || jidNorm || "").replace(/\D/g, "");
      const itemCache = atendimentosHumanosCache.get(jidNorm) || 
                        atendimentosHumanosCache.get(r.remote_jid) ||
                        atendimentosHumanosCache.get(numLimpo) ||
                        (numLimpo ? atendimentosHumanosCache.get(`${numLimpo}@s.whatsapp.net`) : undefined);

      const minutosRestantes = itemCache && itemCache.expiraEm > agora ? Math.round((itemCache.expiraEm - agora) / 60000) : 0;
      const statusFinal = (estaPausado || r.status === "HUMANO") ? "HUMANO" : "IA";
      const motivoFinal = statusFinal === "HUMANO" ? (itemCache?.motivo || r.motivo_pausa || "Atendimento assumido") : null;

      return {
        remote_jid: r.remote_jid,
        numero: r.numero || numLimpo,
        nome: r.nome || "Cliente",
        ultima_mensagem: r.ultima_mensagem || "",
        ultimo_remetente: r.ultimo_remetente || "CLIENTE",
        status: statusFinal,
        motivo_pausa: motivoFinal,
        minutos_restantes: minutosRestantes,
        atualizado_em: r.atualizado_em,
        criado_em: r.criado_em
      };
    });

    listaFinal.sort((a, b) => (Number(b.atualizado_em) || 0) - (Number(a.atualizado_em) || 0));
    return listaFinal;
  } catch (err: any) {
    console.error("[CONVERSAS] Erro ao listar conversas:", err.message);
    return [];
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
    const minutosPausa = Number(config.tempo_pausa_humano_minutos || 30); // 30 minutos sem interação por padrão
    const agora = Date.now();
    const expiraEm = agora + (minutosPausa * 60 * 1000);
    const iniciadoEm = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    const jidNormalizado = normalizarRemoteJid(remoteJid);
    const numFormatado = (numero || jidNormalizado).replace(/[^0-9]/g, "");
    const nomeFormatado = nome || "";

    const itemCache = {
      numero: numFormatado,
      nome: nomeFormatado,
      motivo,
      iniciadoEm,
      expiraEm
    };

    // Indexa por JID normalizado, JID original, número limpo e formato @s.whatsapp.net
    atendimentosHumanosCache.set(jidNormalizado, itemCache);
    if (remoteJid !== jidNormalizado) {
      atendimentosHumanosCache.set(remoteJid, itemCache);
    }
    if (numFormatado) {
      atendimentosHumanosCache.set(numFormatado, itemCache);
      atendimentosHumanosCache.set(`${numFormatado}@s.whatsapp.net`, itemCache);
    }
    if (lidToPhoneMap.has(remoteJid)) {
      const tel = lidToPhoneMap.get(remoteJid)!;
      atendimentosHumanosCache.set(tel, itemCache);
      atendimentosHumanosCache.set(`${tel}@s.whatsapp.net`, itemCache);
    }

    db.prepare(`
      INSERT INTO atendimentos_humanos (remote_jid, numero, nome, motivo, iniciado_em, expira_em)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(remote_jid) DO UPDATE SET
        numero = excluded.numero,
        nome = CASE WHEN excluded.nome != '' THEN excluded.nome ELSE atendimentos_humanos.nome END,
        motivo = excluded.motivo,
        expira_em = excluded.expira_em
    `).run(jidNormalizado, numFormatado, nomeFormatado, motivo, iniciadoEm, expiraEm);

    registrarAtividadeConversa(jidNormalizado, {
      numero: numFormatado,
      nome: nomeFormatado,
      status: "HUMANO",
      motivoPausa: motivo,
      ultimoRemetente: "HUMANO"
    });

    console.log(`[PAUSA ROBÔ] Atendimento humano ativado/renovado para ${remoteJid} por ${minutosPausa} min. Motivo: ${motivo}`);
  } catch (e: any) {
    console.error("Erro ao ativar pausa de atendimento humano:", e.message);
  }
}

export function verificarAtendimentoHumanoAtivo(remoteJid: string): boolean {
  const agora = Date.now();
  const numLimpo = remoteJid.replace(/[^0-9]/g, "");

  // 1. Checa no cache em memória (por JID direto, número ou mapeamento de LID)
  let item = atendimentosHumanosCache.get(remoteJid) ||
             (numLimpo ? atendimentosHumanosCache.get(numLimpo) : null) ||
             (numLimpo ? atendimentosHumanosCache.get(`${numLimpo}@s.whatsapp.net`) : null);

  if (!item && lidToPhoneMap.has(remoteJid)) {
    const tel = lidToPhoneMap.get(remoteJid)!;
    item = atendimentosHumanosCache.get(tel) || atendimentosHumanosCache.get(`${tel}@s.whatsapp.net`);
  }

  // 2. Se não estiver no cache em memória, consulta o banco SQLite
  if (!item) {
    try {
      const db = getDb();
      const ultimos8 = numLimpo.length >= 8 ? numLimpo.slice(-8) : numLimpo;
      const row: any = db.prepare(`
        SELECT * FROM atendimentos_humanos 
        WHERE (remote_jid = ? OR numero = ? OR (? != '' AND numero LIKE '%' || ? || '%'))
          AND expira_em > ?
      `).get(remoteJid, numLimpo, ultimos8, ultimos8, agora);

      if (row) {
        item = {
          numero: row.numero || numLimpo,
          nome: row.nome || "",
          motivo: row.motivo || "Atendimento humano ativo",
          iniciadoEm: row.iniciado_em || "",
          expiraEm: Number(row.expira_em)
        };
        atendimentosHumanosCache.set(remoteJid, item);
        if (numLimpo) atendimentosHumanosCache.set(numLimpo, item);
      }
    } catch (e: any) {
      console.warn("Erro ao consultar atendimentos_humanos no banco:", e.message);
    }
  }

  if (!item) return false;

  // 3. Se expirou (mais de 30 minutos sem nenhuma interação de ambas as partes)
  if (agora > item.expiraEm) {
    removerPausaAtendimentoHumano(remoteJid);
    console.log(`[ATENDIMENTO HUMANO EXPIRADO] 30 minutos sem interação para ${remoteJid}. Elaine.IA reassumindo o atendimento!`);
    return false;
  }

  return true;
}

export function removerPausaAtendimentoHumano(remoteJid: string) {
  const numLimpo = remoteJid.replace(/[^0-9]/g, "");
  atendimentosHumanosCache.delete(remoteJid);
  if (numLimpo) {
    atendimentosHumanosCache.delete(numLimpo);
    atendimentosHumanosCache.delete(`${numLimpo}@s.whatsapp.net`);
  }
  if (lidToPhoneMap.has(remoteJid)) {
    const tel = lidToPhoneMap.get(remoteJid)!;
    atendimentosHumanosCache.delete(tel);
    atendimentosHumanosCache.delete(`${tel}@s.whatsapp.net`);
  }

  try {
    const ultimos8 = numLimpo.length >= 8 ? numLimpo.slice(-8) : numLimpo;
    getDb().prepare("DELETE FROM atendimentos_humanos WHERE remote_jid = ? OR numero = ? OR (? != '' AND numero LIKE '%' || ? || '%')").run(remoteJid, numLimpo, ultimos8, ultimos8);
    registrarAtividadeConversa(remoteJid, {
      status: "IA",
      motivoPausa: undefined
    });
    console.log(`[PAUSA ROBÔ] Robô reativado para ${remoteJid}`);
  } catch (e: any) {
    console.error("Erro ao remover atendimento humano:", e.message);
  }
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

    const msgAudio = lote.find(m => m.ehAudio);
    const temAudio = Boolean(msgAudio);
    const temImagem = lote.some(m => m.ehImagem);
    const ultimo = lote[lote.length - 1];

    const numeroLimpo = remoteJid.replace(/[^0-9]/g, "");
    const extraInfo = {
      senderPn: ultimo?.senderPn,
      participantPn: ultimo?.participantPn,
      pushName: ultimo?.pushName,
      ehAudio: temAudio,
      ehImagem: temImagem,
      rawMsg: msgAudio?.rawMsg || ultimo?.rawMsg
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

export async function garantirBotIniciadoSeCredsExistem() {
  try {
    const credsPath = path.join(AUTH_DIR, "creds.json");
    if (connectionStatus === "DESCONECTADO" && !isConnecting && fs.existsSync(credsPath)) {
      setRoboPausado(false);
      console.log("[AUTO-BOOT] Credenciais do WhatsApp encontradas! Reconectando automaticamente...");
      iniciarWhatsAppBot().catch((err) => {
        console.error("[AUTO-BOOT] Erro ao auto-iniciar bot:", err.message);
      });
    }
  } catch (e) {}
}

export async function iniciarWhatsAppBot() {
  setRoboPausado(false);
  try { iniciarAgendadorSincronizacaoBooksy(); } catch (e) {}
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

        // Iniciar sincronização automática diária com o Booksy
        try { iniciarAgendadorSincronizacaoBooksy(); } catch (e) {}
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

    // Sincronização inicial de histórico recente enviada pelo WhatsApp (Baileys)
    sock.ev.on("messaging-history.set", ({ messages }: any) => {
      try {
        if (!messages || !Array.isArray(messages)) return;
        for (const msg of messages) {
          if (!msg || !msg.message) continue;
          const remoteJid = msg.key?.remoteJid;
          if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") continue;

          const telLimpo = remoteJid.replace(/[^0-9]/g, "");
          const timestampMsg = Number(msg.messageTimestamp) * 1000 || Date.now();
          const { texto, tipo } = extrairTextoEInfoMensagem(msg);
          if (!texto) continue;

          const remetente = msg.key?.fromMe ? "HUMANO" : "CLIENTE";
          const nome = msg.key?.fromMe ? "Barbeiro" : (msg.pushName || "Cliente");

          registrarMensagemNoHistorico(
            remoteJid,
            telLimpo,
            remetente,
            nome,
            texto,
            tipo,
            timestampMsg
          );
        }
      } catch (e) {}
    });

    sock.ev.on("messages.upsert", async (m: any) => {
      // 1. Processar mensagens recebidas (notify) E mensagens enviadas pelo atendente/barbeiro no celular (append)
      if (!m.messages || m.messages.length === 0) return;
      if (m.type !== "notify" && m.type !== "append") return;

      for (const msg of m.messages) {
        try {
          if (!msg || !msg.message) continue;

          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") continue;

          const telLimpo = remoteJid.replace(/[^0-9]/g, "");
          const timestampMsg = Number(msg.messageTimestamp) * 1000 || Date.now();
          const ehMensagemAntiga = Boolean(timestampMsg && Date.now() - timestampMsg > 90000);

          // 1. DETECÇÃO INTELIGENTE DE INTERVENÇÃO HUMANA (Mensagem enviada pela própria barbearia)
          if (msg.key.fromMe) {
            const msgId = msg.key.id;
            if (msgId && mensagensEnviadasPeloRobo.has(msgId)) {
              // Foi o próprio robô que disparou esta mensagem automaticamente
              mensagensEnviadasPeloRobo.delete(msgId);
              continue;
            }

            // SE NÃO FOI O ROBÔ, FOI O BARBEIRO / ATENDENTE NO CELULAR OU NO WHATSAPP WEB!
            const { texto: textoAtendente, tipo: tipoMsgAtendente } = extrairTextoEInfoMensagem(msg);
            const textoLimpoAtendente = textoAtendente.toLowerCase();

            // Grava sempre no histórico de mensagens para visualização imediata no painel
            if (textoAtendente) {
              registrarMensagemNoHistorico(
                remoteJid,
                telLimpo,
                "HUMANO",
                (msg as any)?.pushName || "Barbeiro",
                textoAtendente,
                tipoMsgAtendente,
                timestampMsg
              );
            }

            // Ignorar mensagens antigas de sincronização de histórico (> 90s) para não disparar pausa em mensagens velhas
            if (ehMensagemAntiga) {
              continue;
            }

            // COMANDO OFICIAL: ASSUMIR ATENDIMENTO HUMANO (/atender)
            if (
              textoLimpoAtendente === "/atender" ||
              textoLimpoAtendente === "!atender" ||
              textoLimpoAtendente === "atender"
            ) {
              ativarPausaAtendimentoHumano(
                remoteJid,
                "Atendente assumiu com /atender",
                (msg as any)?.pushName,
                telLimpo
              );
              console.log(`[COMANDO /ATENDER] Atendente assumiu a conversa com ${remoteJid}! Elaine.IA em pausa por 30 minutos.`);
              continue;
            }

            // COMANDO AUXILIAR: LIBERAR ELAINE.IA ANTECIPADAMENTE (/ia, /retomar, /liberar, #ativar, #reativar)
            if (
              textoLimpoAtendente === "/ia" ||
              textoLimpoAtendente === "/retomar" ||
              textoLimpoAtendente === "/liberar" ||
              textoLimpoAtendente === "#ativar" ||
              textoLimpoAtendente === "#reativar"
            ) {
              removerPausaAtendimentoHumano(remoteJid);
              console.log(`[COMANDO /IA] Elaine.IA retomada manualmente para ${remoteJid}!`);
              continue;
            }

            // CANCELA IMEDIATAMENTE QUALQUER RESPOSTA PENDENTE NO BUFFER/TIMER DO ROBÔ PARA ESTE CLIENTE
            if (chatBuffers.has(remoteJid)) {
              const cb = chatBuffers.get(remoteJid);
              if (cb?.timer) clearTimeout(cb.timer);
              cb.mensagens = [];
              cb.processando = false;
            }

            // Qualquer mensagem digitada pelo atendente no celular ou WhatsApp Web ATIVA/RENOVA a pausa de 30 minutos
            ativarPausaAtendimentoHumano(
              remoteJid,
              "Atendente conversando no WhatsApp",
              (msg as any)?.pushName,
              telLimpo
            );
            registrarAtividadeConversa(remoteJid, {
              numero: telLimpo,
              nome: (msg as any)?.pushName,
              ultimaMensagem: textoAtendente || "Mensagem enviada pelo barbeiro",
              ultimoRemetente: "HUMANO",
              status: "HUMANO",
              motivoPausa: "Atendente conversando no WhatsApp"
            });
            console.log(`[PAUSA ROBÔ] Atendente humano enviou mensagem para ${remoteJid}. IA pausada por 30 minutos sem interação.`);
            continue;
          }

          // 2. MENSAGEM RECEBIDA DO CLIENTE (msg.key.fromMe = false)
          // Ignorar reações, mensagens apagadas, recibos de leitura e protocolos
          if (msg.message.protocolMessage || msg.message.reactionMessage) continue;

          // Deduplicação absoluta
          const msgId = msg.key.id;
          if (!msgId || mensagensProcessadas.has(msgId)) continue;
          mensagensProcessadas.add(msgId);

          // Salva mensagem completa no cache de contingência
          if (msg.message) {
            salvarMensagemNoCache(msgId, msg.key.remoteJid, { ...msg.message, key: msg.key, pushName: msg.pushName });
          }

          // Manter o cache controlado para evitar acúmulo de memória
          if (mensagensProcessadas.size > 2000) {
            const first = mensagensProcessadas.values().next().value;
            if (first) mensagensProcessadas.delete(first);
          }

          // Extrai texto e tipo de forma robusta
          const { texto: textoClienteOriginal, tipo: tipoMsgCliente } = extrairTextoEInfoMensagem(msg);
          const textoCliente = textoClienteOriginal.toLowerCase();
          const nomeCliente = msg.pushName || (msg as any)?.verifiedBizName || "Cliente";
          let emAtendimentoHumano = verificarAtendimentoHumanoAtivo(remoteJid);

          // SEMPRE GRAVAR NO HISTÓRICO DE MENSAGENS PARA O POPUP DO PAINEL EXIBIR O DIÁLOGO COMPLETO!
          const previewMsg = textoClienteOriginal || (tipoMsgCliente === "audio" ? "🎙️ Áudio" : (tipoMsgCliente === "imagem" ? "📷 Imagem" : "Mensagem"));
          registrarMensagemNoHistorico(
            remoteJid,
            telLimpo,
            "CLIENTE",
            nomeCliente,
            previewMsg,
            tipoMsgCliente,
            timestampMsg
          );

          // Se for mensagem antiga (> 90 segundos), NÃO dispara resposta da IA, mas ela já está salva no histórico!
          if (ehMensagemAntiga) {
            continue;
          }

          // 3. SE O CLIENTE ENVIAR SAUDAÇÃO OU COMANDO DE REATIVAÇÃO, REATIVA O ROBÔ IMEDIATAMENTE
          if (emAtendimentoHumano && ehComandoReativarBot(textoCliente)) {
            removerPausaAtendimentoHumano(remoteJid);
            emAtendimentoHumano = false;
            console.log(`[ROBÔ REATIVADO] Conversa com ${remoteJid} reativada por comando/saudação ('${textoCliente}')!`);
          }

          // Atualiza lista de conversas ativas no painel
          registrarAtividadeConversa(remoteJid, {
            numero: telLimpo,
            nome: nomeCliente,
            ultimaMensagem: previewMsg,
            ultimoRemetente: "CLIENTE",
            status: emAtendimentoHumano ? "HUMANO" : "IA"
          });

          // VERIFICAÇÃO DE PAUSA GLOBAL DO ROBÔ (Pausado no painel)
          if (isRoboPausado()) {
            console.log(`[ROBÔ PAUSADO GLOBALMENTE] Mensagem de ${remoteJid} registrada no painel, mas não respondida (pausa ativa): '${textoCliente}'`);
            continue;
          }

          // Se continuar em atendimento humano ativo (e cliente não enviou comando de reativação)
          if (emAtendimentoHumano) {
            ativarPausaAtendimentoHumano(
              remoteJid,
              "Conversa ativa com atendente humano",
              nomeCliente,
              telLimpo
            );
            console.log(`[ROBÔ SILENCIADO] Atendimento humano em andamento com ${remoteJid}. Mensagem registrada no painel.`);
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
            participantPn: (msg.key as any)?.participantPn,
            rawMsg: msg
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
      await sock.logout().catch(() => {});
      sock.end?.();
    } catch (e) {}
    sock = null;
  }
  mensagensProcessadas.clear();
  chatBuffers.clear();
  connectionStatus = "DESCONECTADO";
  currentQr = null;
  connectedNumber = null;

  try {
    if (fs.existsSync(AUTH_DIR)) {
      const arquivos = fs.readdirSync(AUTH_DIR);
      for (const arq of arquivos) {
        try {
          fs.unlinkSync(path.join(AUTH_DIR, arq));
        } catch (e) {}
      }
      try {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      } catch (e) {}
    }
  } catch (e) {
    console.warn("[BOT] Aviso ao limpar auth_dir:", (e as any)?.message);
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
    rawMsg?: any;
    audioOriginal?: boolean;
    transcricaoAudio?: string;
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

  // Registrar atividade da conversa no histórico permanente de atendimentos
  registrarAtividadeConversa(remoteJid, {
    numero: telefoneRealCliente,
    nome: nomeCliente,
    ultimaMensagem: texto,
    ultimoRemetente: "CLIENTE",
    status: verificarAtendimentoHumanoAtivo(remoteJid) ? "HUMANO" : "IA"
  });
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

  // =========================================================================
  // 1. COMANDOS ADMINISTRATIVOS EXCLUSIVOS DO ATENDENTE / BARBEIRO
  // =========================================================================

  // COMANDO #INICIAR / #PAUSAR (Barbeiro assume manualmente a conversa no celular)
  if (texto === "#iniciar" || texto === "#pausar") {
    ativarPausaAtendimentoHumano(remoteJid, "Atendimento humano assumido via comando", extraInfo?.pushName, numeroLimpo);
    const resposta = `👨‍💼 *Atendimento Iniciado:* Nosso profissional da equipe *${barbearia}* acabou de assumir a conversa e falará diretamente com você a partir de agora! 💈`;
    await enviarRespostaHumanizada(resposta);
    return;
  }

  // COMANDO #ATIVAR / #REATIVAR (Barbeiro devolve o atendimento para a Elaine.IA)
  if (texto === "#ativar" || texto === "#reativar") {
    removerPausaAtendimentoHumano(remoteJid);
    const resposta = `✨ *Atendimento Reativado!* Sou a Elaine.IA, assistente virtual da *${barbearia}*, e estou de volta à sua disposição. Como posso te ajudar? 💈`;
    await enviarRespostaHumanizada(resposta);
    return;
  }

  // =========================================================================
  // 2. SE O CLIENTE ENVIOU UM ÁUDIO:
  // Elaine.IA ouve o áudio através do Google Gemini e transcreve fielmente!
  // Se for saudação ou dúvida, responde em texto naturalmente sem travar a conversa.
  // Se for pedido de falar com barbeiro/atraso, encaminha para o Anti-Spam real.
  // Se falhar o download ou compreensão, ativa o fallback humanizado.
  // =========================================================================
  if (extraInfo?.ehAudio) {
    let audioBuffer: Buffer | null = null;
    try {
      if (extraInfo.rawMsg) {
        audioBuffer = await downloadMediaMessage(
          extraInfo.rawMsg,
          "buffer",
          {},
          {
            logger: pino({ level: "silent" }),
            reuploadRequest: sock?.updateMediaMessage
          }
        ) as Buffer;
      }
    } catch (downloadErr: any) {
      console.warn(`[BOT ÁUDIO] Falha ao baixar mídia de áudio de ${remoteJid}:`, downloadErr.message);
    }

    let transcricao: string | null = null;
    if (audioBuffer && audioBuffer.length > 0) {
      const mime = extraInfo.rawMsg?.message?.audioMessage?.mimetype || "audio/ogg; codecs=opus";
      console.log(`[BOT ÁUDIO] Áudio baixado (${audioBuffer.length} bytes). Enviando para o Gemini transcrever...`);
      transcricao = await transcreverAudioComGemini(audioBuffer, mime);
    }

    if (transcricao && transcricao.trim().length > 0) {
      console.log(`[BOT ÁUDIO] Elaine.IA ouviu o áudio de ${remoteJid}: "${transcricao}"`);

      // Atualiza o painel para os barbeiros verem o que o cliente falou
      registrarAtividadeConversa(remoteJid, {
        numero: telefoneRealCliente,
        nome: nomeCliente,
        ultimaMensagem: `🎙️ [Áudio]: "${transcricao}"`,
        ultimoRemetente: "CLIENTE",
        status: "IA"
      });
      registrarMensagemNoHistorico(
        remoteJid,
        telefoneRealCliente,
        "CLIENTE",
        nomeCliente,
        `🎙️ [Áudio]: "${transcricao}"`,
        "audio"
      );

      // Prossegue o fluxo normal com o texto compreendido
      const textoFinalCliente = texto ? `${texto} [Áudio]: ${transcricao}` : transcricao;
      await processarMensagemRobo(remoteJid, numeroLimpo, textoFinalCliente, {
        ...extraInfo,
        ehAudio: false,
        audioOriginal: true,
        transcricaoAudio: transcricao
      });
      return;
    } else {
      console.warn(`[BOT ÁUDIO] Áudio inaudível ou falha na transcrição para ${remoteJid}. Enviando fallback.`);
      const respostaAudio = `Olá, *${nomeCliente}*! Sou a Elaine.IA, assistente virtual da *${barbearia}*. Recebi seu áudio com sucesso! 🎧\n\nNão consegui compreender o áudio com clareza, mas nossa equipe já foi notificada para ouvir com atenção e te responder em breve. Caso deseje agendar seu horário sem fila, você também pode acessar diretamente nosso Booksy:\n👉 *${linkBooksy}*`;
      await enviarRespostaHumanizada(respostaAudio);
      ativarPausaAtendimentoHumano(remoteJid, "Cliente enviou áudio", extraInfo?.pushName, numeroLimpo);
      return;
    }
  }

  // =========================================================================
  // 3. SE O CLIENTE ENVIOU IMAGEM / FOTO / COMPROVANTE (sem texto):
  // Informa com transparência que é assistente de texto e salva para os barbeiros
  // =========================================================================
  if (extraInfo?.ehImagem && !texto) {
    const respostaImagem = `Recebi sua imagem / foto, *${nomeCliente}*! 📸\n\nComo sou uma assistente virtual de texto, ainda não consigo visualizar fotos diretamente, mas já deixei salvo para os nossos barbeiros darem uma olhada! Se quiser garantir o seu horário para fazer esse estilo com a gente:\n👉 *${linkBooksy}* 💈`;
    await enviarRespostaHumanizada(respostaImagem);
    ativarPausaAtendimentoHumano(remoteJid, "Cliente enviou imagem / foto", extraInfo?.pushName, numeroLimpo);
    return;
  }

  // Se o texto for vazio (sem áudio nem mídia), encerra
  if (!texto) {
    return;
  }

  // =========================================================================
  // 3.8. SOLICITAÇÃO DE CONTATO COM UM BARBEIRO / ATENDIMENTO HUMANO
  // Detecta pedidos de falar, recados, atrasos ou encaixes para qualquer barbeiro da casa
  // Aplica proteção Anti-Spam de Duas Pontas (por cliente e por barbeiro)
  // e NUNCA mente sobre quem foi ou não notificado!
  // =========================================================================
  const tLimpoMsg = texto.toLowerCase().trim();
  const querFalarOuAvisar = (
    tLimpoMsg.includes("falar com") ||
    tLimpoMsg.includes("falar c/") ||
    tLimpoMsg.includes("falar com o") ||
    tLimpoMsg.includes("falar com a") ||
    tLimpoMsg.includes("falar com um") ||
    tLimpoMsg.includes("falar com ele") ||
    tLimpoMsg.includes("chama o") ||
    tLimpoMsg.includes("chamar o") ||
    tLimpoMsg.includes("chama a") ||
    tLimpoMsg.includes("chamar a") ||
    tLimpoMsg.includes("conversar com") ||
    tLimpoMsg.includes("avisa o") ||
    tLimpoMsg.includes("avise o") ||
    tLimpoMsg.includes("avisa a") ||
    tLimpoMsg.includes("avise a") ||
    tLimpoMsg.includes("avisa pro") ||
    tLimpoMsg.includes("avisa pra") ||
    tLimpoMsg.includes("avise pro") ||
    tLimpoMsg.includes("avise pra") ||
    tLimpoMsg.includes("recado para") ||
    tLimpoMsg.includes("recado pro") ||
    tLimpoMsg.includes("recado pra") ||
    tLimpoMsg.includes("fala pro") ||
    tLimpoMsg.includes("fala para") ||
    tLimpoMsg.includes("fale pro") ||
    tLimpoMsg.includes("fale para") ||
    tLimpoMsg.includes("diga pro") ||
    tLimpoMsg.includes("diga para") ||
    tLimpoMsg.includes("diga ao") ||
    tLimpoMsg.includes("duvida com") ||
    tLimpoMsg.includes("dúvida com") ||
    tLimpoMsg.includes("atendente") ||
    tLimpoMsg.includes("humano") ||
    tLimpoMsg.includes("atrasado") ||
    tLimpoMsg.includes("atraso") ||
    tLimpoMsg.includes("vou atrasar") ||
    tLimpoMsg.includes("chegar atrasado") ||
    tLimpoMsg.includes("encaixe") ||
    tLimpoMsg.includes("vaga com") ||
    tLimpoMsg.includes("horario com") ||
    tLimpoMsg.includes("horário com") ||
    tLimpoMsg === "/atender" ||
    tLimpoMsg === "atender" ||
    tLimpoMsg === "/humano"
  );

  if (querFalarOuAvisar) {
    const db = getDb();
    const barbeirosAtivos: any[] = db.prepare("SELECT * FROM barbeiros WHERE ativo = 1").all() || [];

    // Tenta encontrar qual barbeiro da casa o cliente mencionou
    let barbeiroAlvo = barbeirosAtivos.find(b => {
      const nomes = b.nome.toLowerCase().split(/\s+/).filter((p: string) => p.length >= 3);
      return nomes.some((parte: string) => tLimpoMsg.includes(parte));
    });

    // Se o cliente pediu alguém específico que NÃO existe na equipe oficial da barbearia
    if (!barbeiroAlvo) {
      const matchPessoa = tLimpoMsg.match(/(?:avisa(?:r)?|avise|falar com|conversar com|chama(?:r)?|recado para|recado pro|fala pro|fale pro|diga pro|diga para)\s+(?:o|a)?\s*([a-zá-ú]+(?:\s+[a-zá-ú]+)?)/i);
      const palavrasGenericas = ["barbeiro", "atendente", "humano", "alguem", "alguém", "recepcao", "recepção", "equipe", "salão", "salao"];
      
      if (matchPessoa && !palavrasGenericas.includes(matchPessoa[1].toLowerCase().trim())) {
        const nomeMencionado = matchPessoa[1].trim();
        const listaOficial = barbeirosAtivos.map(b => b.nome.split(" ")[0]).join(" e ");
        
        const respostaBarbeiroInexistente = `Olá, *${nomeCliente}*! O profissional *${nomeMencionado.charAt(0).toUpperCase() + nomeMencionado.slice(1)}* não faz parte da equipe da *${barbearia}*. 💈\n\nNossos barbeiros oficiais da casa são: *${listaOficial || "nossa equipe"}*.\n\nGostaria que eu deixasse um recado para algum deles? Caso queira conferir horários disponíveis, acesse nosso Booksy:\n👉 *${linkBooksy}*`;
        
        await enviarRespostaHumanizada(respostaBarbeiroInexistente);
        return;
      }

      // Se for pedido genérico (ex: "falar com um barbeiro", "/atender", "atraso"): direciona para o primeiro barbeiro
      barbeiroAlvo = barbeirosAtivos[0];
    }

    if (barbeiroAlvo) {
      const agora = Date.now();
      const nomeBarbeiroExibicao = barbeiroAlvo.nome.split(" ")[0];

      // -----------------------------------------------------------------------
      // 1. CAMADA ANTI-SPAM POR CLIENTE (O mesmo número não spamma ninguém por 5 min)
      // -----------------------------------------------------------------------
      const ultimoAlertaCliente = ultimosAlertasPorCliente.get(remoteJid) || 0;
      const clienteEmCooldown = (agora - ultimoAlertaCliente) < INTERVALO_COOLDOWN_CLIENTE_MS;

      if (clienteEmCooldown) {
        console.log(`[ANTI-SPAM CLIENTE] Bloqueado alerta duplicado de ${remoteJid} (cooldown de 5 min ativo).`);
        
        // ELAINE NÃO MENTE: Explica que o recado anterior já foi entregue e pede para aguardar
        const respostaCooldown = `Você já enviou um recado para a nossa equipe há poucos instantes e eles já foram avisados! 🔔\n\nComo nossos barbeiros atendem com hora marcada e podem estar ocupados na cadeira com cliente, peço só uma pequena pausa que assim que ele liberar ele te responde por aqui!\n\nSe preferir adiantar ou alterar seu agendamento sem fila:\n👉 *${linkBooksy}* 💈`;
        
        await enviarRespostaHumanizada(respostaCooldown);
        return;
      }

      // -----------------------------------------------------------------------
      // 2. CAMADA ANTI-SPAM POR BARBEIRO (Máximo 5 alertas por hora no WhatsApp dele)
      // -----------------------------------------------------------------------
      let numBarbeiro = String(barbeiroAlvo.telefone_whatsapp || "").replace(/\D/g, "");
      if (numBarbeiro.length <= 11 && !numBarbeiro.startsWith("55")) {
        numBarbeiro = "55" + numBarbeiro;
      }
      const barbeiroJid = numBarbeiro ? `${numBarbeiro}@s.whatsapp.net` : null;

      if (barbeiroJid) {
        const historicoBarbeiro = (ultimosAlertasPorBarbeiro.get(barbeiroJid) || []).filter(t => agora - t < JANELA_HORA_BARBEIRO_MS);
        
        if (historicoBarbeiro.length >= MAX_ALERTAS_HORA_BARBEIRO) {
          console.log(`[ANTI-SPAM BARBEIRO] Limite de 5 alertas/hora atingido para ${barbeiroAlvo.nome} (${barbeiroJid}).`);
          
          ativarPausaAtendimentoHumano(remoteJid, `Cliente deixou recado para ${nomeBarbeiroExibicao} (limite horário atingido)`, nomeCliente, telefoneRealCliente);
          
          const respostaLimiteBarbeiro = `O *${nomeBarbeiroExibicao}* está com muitos atendimentos no momento! 💈\n\nJá registrei seu recado no nosso painel de atendimento para ele visualizar assim que liberar da cadeira. Para consultar horários disponíveis e agendar sem fila:\n👉 *${linkBooksy}*`;
          
          await enviarRespostaHumanizada(respostaLimiteBarbeiro);
          return;
        }
      }

      // -----------------------------------------------------------------------
      // 3. ENVIO REAL DO ALERTA NO WHATSAPP DO PROFISSIONAL
      // -----------------------------------------------------------------------
      let alertaEnviadoComSucesso = false;

      if (barbeiroJid && barbeiroJid !== remoteJid) {
        const detalheMsg = extraInfo?.audioOriginal
          ? `🎙️ [Áudio do Cliente Transcrito]: "${extraInfo.transcricaoAudio || texto}"`
          : `"${texto}"`;
        const msgAlertaBarbeiro = `🔔 *ALERTA DE CLIENTE - ${barbearia.toUpperCase()}* 💈\n\nOlá, *${barbeiroAlvo.nome}*! O cliente *${nomeCliente}* está no WhatsApp da barbearia solicitando falar com você.\n\n📱 *WhatsApp do Cliente:* https://wa.me/${telefoneRealCliente}\n💬 *Mensagem do cliente:* ${detalheMsg}\n\n_Você pode responder o cliente diretamente no WhatsApp ou pelo Painel da Barbearia!_`;

        try {
          await enviarMensagemDoBot(barbeiroJid, { text: msgAlertaBarbeiro });
          console.log(`[ALERTA BARBEIRO] Mensagem de alerta enviada com sucesso para ${barbeiroAlvo.nome} (${barbeiroJid})`);
          alertaEnviadoComSucesso = true;

          // Atualiza registros de anti-spam em ambas as pontas
          ultimosAlertasPorCliente.set(remoteJid, agora);
          const historicoAtualizado = [...(ultimosAlertasPorBarbeiro.get(barbeiroJid) || []).filter(t => agora - t < JANELA_HORA_BARBEIRO_MS), agora];
          ultimosAlertasPorBarbeiro.set(barbeiroJid, historicoAtualizado);
        } catch (errAlerta) {
          console.error(`[ALERTA BARBEIRO] Falha ao enviar alerta para ${barbeiroJid}:`, errAlerta);
        }
      }

      // Ativa atendimento humano no painel da barbearia
      ativarPausaAtendimentoHumano(remoteJid, `Cliente solicitou falar com ${nomeBarbeiroExibicao}`, nomeCliente, telefoneRealCliente);

      // -----------------------------------------------------------------------
      // 4. RESPOSTA DA ELAINE.IA 100% CONDICIONADA À VERDADE
      // -----------------------------------------------------------------------
      let respostaAlertaCliente = "";
      if (alertaEnviadoComSucesso) {
        respostaAlertaCliente = `Vou encaminhar um alerta para o *${nomeBarbeiroExibicao}* agora mesmo! 🔔\n\nProntinho, acabei de enviar a notificação no WhatsApp particular dele! Assim que ele finalizar o atendimento da vez, ele te responderá por aqui. Se quiser adiantar o agendamento enquanto ele responde, você pode fazer diretamente pelo nosso Booksy:\n👉 *${linkBooksy}* 💈`;
      } else {
        respostaAlertaCliente = `Já registrei seu recado para o *${nomeBarbeiroExibicao}* diretamente no nosso painel de atendimento! 🔔\n\nEle já foi sinalizado e te responderá assim que liberar da cadeira. Se quiser consultar horários ou agendar sem fila:\n👉 *${linkBooksy}* 💈`;
      }

      await enviarRespostaHumanizada(respostaAlertaCliente);
      registrarAtividadeConversa(remoteJid, {
        numero: telefoneRealCliente,
        nome: nomeCliente,
        ultimaMensagem: respostaAlertaCliente,
        ultimoRemetente: "IA",
        status: "HUMANO",
        motivoPausa: `Alerta enviado para ${nomeBarbeiroExibicao}`
      });
      return;
    }
  }

  // =========================================================================
  // 4. ATENDIMENTO 100% EXCLUSIVO PELA ELAINE.IA (GOOGLE GEMINI FLASH)
  // O robô de menus numéricos e respostas mecânicas foi totalmente eliminado.
  // Toda e qualquer mensagem (preços, serviços, agendamento, endereço, dúvidas, saudações)
  // é respondida exclusivamente pela Elaine.IA de forma educada, delicada e formal.
  // =========================================================================

  let respostaIa: string | null = null;

  try {
    respostaIa = await gerarRespostaGemini(texto, remoteJid, nomeCliente);
  } catch (errIa: any) {
    console.warn(`[IA ELAINE] Erro ao chamar Gemini: ${errIa.message}`);
  }

  if (respostaIa && respostaIa.trim().length > 0) {
    await enviarRespostaHumanizada(respostaIa);
    registrarAtividadeConversa(remoteJid, {
      numero: telefoneRealCliente,
      nome: nomeCliente,
      ultimaMensagem: respostaIa,
      ultimoRemetente: "IA",
      status: "IA"
    });
    return;
  }

  // =========================================================================
  // 5. RESPOSTA DE CONTINGÊNCIA NATIVA DA ELAINE.IA (Caso a API do Gemini oscile)
  // NUNCA envia menus numéricos ou mensagens de robô.
  // Mantém estritamente a voz, educação, tom delicado e formal da Elaine.IA.
  // =========================================================================
  console.log(`[IA ELAINE] Ativando contingência inteligente na persona da Elaine.IA para ${remoteJid}...`);

  const tLimpo = texto.toLowerCase().trim();
  let respostaContingencia = "";

  if (
    tLimpo.includes("agendar") || 
    tLimpo.includes("marcar") || 
    tLimpo.includes("horario") || 
    tLimpo.includes("horário") || 
    tLimpo.includes("vaga") || 
    tLimpo.includes("booksy") || 
    tLimpo.includes("corte")
  ) {
    respostaContingencia = `Olá, *${nomeCliente}*! Para agendar seu horário com total comodidade e sem fila, você pode escolher o serviço, barbeiro e horário diretamente pelo nosso Booksy:\n👉 *${linkBooksy}*\n\nSe precisar de mais alguma informação, estou à sua disposição! ✨`;
  } else if (
    tLimpo.includes("barbeiro") ||
    tLimpo.includes("barbeiros") ||
    tLimpo.includes("falar com") ||
    tLimpo.includes("atendente") ||
    tLimpo.includes("equipe")
  ) {
    respostaContingencia = `Olá, *${nomeCliente}*! Nossos barbeiros estão à disposição. Para escolher o profissional de sua preferência e agendar seu horário sem fila, você pode acessar diretamente nosso Booksy:\n👉 *${linkBooksy}*\n\nSe preferir deixar um recado para algum barbeiro específico, é só me dizer! 💈`;
  } else if (
    tLimpo.includes("preco") || 
    tLimpo.includes("preço") || 
    tLimpo.includes("valor") || 
    tLimpo.includes("quanto") || 
    tLimpo.includes("tabela") || 
    tLimpo.includes("servico") || 
    tLimpo.includes("serviço")
  ) {
    respostaContingencia = `Olá, *${nomeCliente}*! Nossos serviços incluem cortes, barba e procedimentos completos. Você pode consultar todos os valores oficiais e agendar diretamente no nosso Booksy:\n👉 *${linkBooksy}*\n\nSe desejar saber o valor de um procedimento específico, é só me dizer!`;
  } else if (
    tLimpo.includes("onde") || 
    tLimpo.includes("endereco") || 
    tLimpo.includes("endereço") || 
    tLimpo.includes("localizacao") || 
    tLimpo.includes("localização") || 
    tLimpo.includes("como chegar") || 
    tLimpo.includes("rua") ||
    tLimpo.includes("cep")
  ) {
    respostaContingencia = `Olá, *${nomeCliente}*! Ficamos localizados em:\n📍 *${endereco}*\n\n${maps ? "🗺️ Link do mapa: " + maps + "\n\n" : ""}⏰ Horário de atendimento: ${horario}. Será um prazer receber você!`;
  } else if (
    tLimpo.includes("pix") || 
    tLimpo.includes("pagamento") || 
    tLimpo.includes("pagar") || 
    tLimpo.includes("cartao") || 
    tLimpo.includes("cartão")
  ) {
    respostaContingencia = `Olá, *${nomeCliente}*! Nossa chave Pix oficial para pagamentos é: *${chavePix}*. Também aceitamos cartões de débito, crédito e dinheiro no local.`;
  } else if (
    tLimpo.includes("plano") || 
    tLimpo.includes("mensalista") || 
    tLimpo.includes("assinatura") || 
    tLimpo.includes("clube")
  ) {
    respostaContingencia = `Olá, *${nomeCliente}*! Nós temos planos mensalistas exclusivos para você manter o corte sempre impecável com desconto. Para conhecer as opções ou assinar, nossa equipe está à disposição para te apresentar todos os detalhes! ✂️`;
  } else if (
    tLimpo.includes("quem te fez") ||
    tLimpo.includes("quem te criou") ||
    tLimpo.includes("quem te desenvolveu") ||
    tLimpo.includes("quem te programou") ||
    tLimpo.includes("quem criou voce") ||
    tLimpo.includes("quem criou você")
  ) {
    respostaContingencia = `Quem me desenvolveu foi o Jhonata Dev, contato 11 978235873, se quiser conhecer um pouco mais! 🚀💻`;
  } else if (
    tLimpo.includes("oi") ||
    tLimpo.includes("olá") ||
    tLimpo.includes("ola") ||
    tLimpo.includes("bom dia") ||
    tLimpo.includes("boa tarde") ||
    tLimpo.includes("boa noite") ||
    tLimpo.includes("tudo bem") ||
    tLimpo.includes("td bem")
  ) {
    if (tLimpo.includes("boa noite")) {
      respostaContingencia = `Boa noite, *${nomeCliente}*! Tudo ótimo por aqui. Em que posso te ajudar hoje na *${barbearia}*?`;
    } else if (tLimpo.includes("boa tarde")) {
      respostaContingencia = `Boa tarde, *${nomeCliente}*! Tudo bem? Como posso te ajudar hoje na *${barbearia}*?`;
    } else if (tLimpo.includes("bom dia")) {
      respostaContingencia = `Bom dia, *${nomeCliente}*! Tudo ótimo por aqui. Como posso te ajudar hoje na *${barbearia}*?`;
    } else if (tLimpo === "tudo bem" || tLimpo === "tudo bem ?" || tLimpo === "td bem" || tLimpo === "td bem ?") {
      respostaContingencia = `Tudo ótimo por aqui, *${nomeCliente}*! Em que posso te ajudar hoje na *${barbearia}*?`;
    } else {
      respostaContingencia = `Olá, *${nomeCliente}*! Tudo ótimo por aqui, e com você? Como posso te ajudar hoje na *${barbearia}*?`;
    }
  } else {
    respostaContingencia = `Olá, *${nomeCliente}*! Como posso te ajudar hoje na *${barbearia}*?`;
  }

  await enviarRespostaHumanizada(respostaContingencia);
  registrarAtividadeConversa(remoteJid, {
    numero: telefoneRealCliente,
    nome: nomeCliente,
    ultimaMensagem: respostaContingencia,
    ultimoRemetente: "IA",
    status: "IA"
  });
}
