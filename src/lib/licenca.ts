import { getDb } from "@/lib/db";
import { setRoboPausado } from "@/lib/whatsapp-bot";

const SUPABASE_URL = "https://wufntpxdzmolrfgzlpyd.supabase.co";
const SUPABASE_KEY = "sb_publishable_sW55EWwxnwYFc82RF1IsEw_yXjNu4RX";
const CHAVE_PADRAO = "LIC-GM-BARBERSHOP-2026";
const HORAS_TOLERANCIA_OFFLINE = 48;

let monitorIniciado = false;

export interface InfoLicenca {
  ativa: boolean;
  status: "ATIVO" | "BLOQUEADO" | "OFFLINE_TOLERANCIA" | "DESCONHECIDO";
  chave: string;
  cliente: string;
  mensagem: string;
  pix: string;
  valor: number;
  vencimento: string | null;
  ultimo_check: string;
  origem: "SUPABASE_ONLINE" | "CACHE_SQLITE";
  horas_restantes_offline?: number;
}

export function obterChaveLicenca(): string {
  try {
    const db = getDb();
    const cfg: any = db.prepare("SELECT chave_licenca FROM configuracoes WHERE id = 'default'").get();
    return cfg?.chave_licenca || CHAVE_PADRAO;
  } catch (e) {
    return CHAVE_PADRAO;
  }
}

// Obter status atual em cache no SQLite (rápido, sem delay de rede)
export function getLicencaCache(): InfoLicenca {
  try {
    const db = getDb();
    const cfg: any = db.prepare("SELECT * FROM configuracoes WHERE id = 'default'").get() || {};
    const chave = cfg.chave_licenca || CHAVE_PADRAO;
    const status = (cfg.licenca_status || "ATIVO").toUpperCase() as any;
    const ultimoCheck = cfg.licenca_ultimo_check || new Date().toISOString();

    return {
      ativa: status === "ATIVO",
      status: status === "BLOQUEADO" ? "BLOQUEADO" : "ATIVO",
      chave,
      cliente: cfg.nome_barbearia || "GM Barbershop",
      mensagem: cfg.licenca_mensagem || "Acesso suspenso por pendência de mensalidade. Entre em contato para regularizar seu acesso.",
      pix: cfg.licenca_pix || cfg.chave_pix || "11960129564",
      valor: Number(cfg.licenca_valor || 150),
      vencimento: cfg.licenca_vencimento || null,
      ultimo_check: ultimoCheck,
      origem: "CACHE_SQLITE"
    };
  } catch (e) {
    return {
      ativa: true,
      status: "ATIVO",
      chave: CHAVE_PADRAO,
      cliente: "GM Barbershop",
      mensagem: "",
      pix: "11960129564",
      valor: 150,
      vencimento: null,
      ultimo_check: new Date().toISOString(),
      origem: "CACHE_SQLITE"
    };
  }
}

// Verificar licença em tempo real com o Supabase
export async function verificarLicencaRemota(chaveManual?: string): Promise<InfoLicenca> {
  const chave = chaveManual || obterChaveLicenca();
  const db = getDb();

  try {
    const url = `${SUPABASE_URL}/rest/v1/licencas?chave=eq.${encodeURIComponent(chave)}&select=*`;
    
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      },
      signal: AbortSignal.timeout(8000),
      cache: "no-store"
    });

    if (res.ok) {
      const rows: any[] = await res.json();
      if (rows && rows.length > 0) {
        const row = rows[0];
        const statusRemoto = String(row.status || "ATIVO").toUpperCase();
        const mensagemRemota = row.mensagem_bloqueio || "Acesso suspenso por pendência de mensalidade. Entre em contato para regularizar seu acesso.";
        const pixRemoto = row.chave_pix_cobranca || "11960129564";
        const valorRemoto = Number(row.valor_mensalidade || 150);
        const vencimentoRemoto = row.vencimento || null;
        const agora = new Date().toISOString();

        // Registrar último ping na nuvem em segundo plano
        fetch(`${SUPABASE_URL}/rest/v1/licencas?chave=eq.${encodeURIComponent(chave)}`, {
          method: "PATCH",
          headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
          },
          body: JSON.stringify({ ultimo_ping: agora })
        }).catch(() => {});

        // Persistir no SQLite local
        db.prepare(`
          UPDATE configuracoes SET
            licenca_status = ?,
            licenca_mensagem = ?,
            licenca_pix = ?,
            licenca_valor = ?,
            licenca_vencimento = ?,
            licenca_ultimo_check = ?
          WHERE id = 'default'
        `).run(
          statusRemoto,
          mensagemRemota,
          pixRemoto,
          valorRemoto,
          vencimentoRemoto,
          agora
        );

        const estaAtiva = statusRemoto === "ATIVO";

        // Se bloqueado, silencia o robô do WhatsApp imediatamente
        if (!estaAtiva) {
          setRoboPausado(true);
          console.log(`[TRAVA LICENÇA] Sistema bloqueado remotamente para chave ${chave}!`);
        }

        return {
          ativa: estaAtiva,
          status: statusRemoto as any,
          chave,
          cliente: row.cliente || "GM Barbershop",
          mensagem: mensagemRemota,
          pix: pixRemoto,
          valor: valorRemoto,
          vencimento: vencimentoRemoto,
          ultimo_check: agora,
          origem: "SUPABASE_ONLINE"
        };
      }
    }
  } catch (err) {
    console.warn("[LICENCA] Não foi possível consultar o Supabase no momento (offline/queda de rede):", (err as any)?.message);
  }

  // FALLBACK OFFLINE COM TOLERÂNCIA DE ATÉ 48 HORAS
  const cache = getLicencaCache();
  const dataUltimoCheck = new Date(cache.ultimo_check).getTime();
  const horasPassadas = (Date.now() - dataUltimoCheck) / (1000 * 3600);

  if (cache.status === "BLOQUEADO") {
    // Se já estava bloqueado no último check, continua bloqueado
    return { ...cache, ativa: false, origem: "CACHE_SQLITE" };
  }

  if (horasPassadas <= HORAS_TOLERANCIA_OFFLINE) {
    // Tolerância offline ativa
    return {
      ...cache,
      ativa: true,
      status: "OFFLINE_TOLERANCIA",
      horas_restantes_offline: Math.max(0, Math.round(HORAS_TOLERANCIA_OFFLINE - horasPassadas)),
      origem: "CACHE_SQLITE"
    };
  }

  // Mais de 48h sem conexão com a nuvem: trava até reconectar
  return {
    ...cache,
    ativa: false,
    status: "BLOQUEADO",
    mensagem: "O sistema está sem acesso à internet há mais de 48 horas para validação da licença de uso. Conecte o notebook ao Wi-Fi para continuar.",
    origem: "CACHE_SQLITE"
  };
}

// Iniciar verificação automática em segundo plano a cada 30 minutos
export function iniciarMonitorLicenca() {
  if (monitorIniciado) return;
  monitorIniciado = true;

  // Verificação inicial rápida após 3 segundos do boot
  setTimeout(() => {
    verificarLicencaRemota().then((info) => {
      console.log(`[LICENÇA BOOT] Status: ${info.status} (Origem: ${info.origem})`);
    }).catch(() => {});
  }, 3000);

  // Intervalo de checagem a cada 30 minutos
  setInterval(() => {
    verificarLicencaRemota().then((info) => {
      console.log(`[LICENÇA INTERVALO] Status: ${info.status}`);
    }).catch(() => {});
  }, 30 * 60 * 1000);
}
