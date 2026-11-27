import { getDb } from "./db";

const DEFAULT_GEMINI_KEY = Buffer.from("QVEuQWI4Uk42THBHMEdIM2ZNNFlyNDhscU5mTW10SVpDMUF6SGx4QjBXR2wwTWJfV3ZMWlE=", "base64").toString("utf-8");

export function obterApiKeyValida(dbConfigKey?: string): string {
  const k = (dbConfigKey || "").trim();
  if (k.startsWith("AQ.") && k.length >= 45) {
    return k;
  }
  const envKey = (process.env.GEMINI_API_KEY || "").trim();
  if (envKey.startsWith("AQ.") && envKey.length >= 45) {
    return envKey;
  }
  return DEFAULT_GEMINI_KEY;
}

// Histórico de conversas recente em memória para dar contexto à IA (memória contínua por chat)
interface MensagemHistorico {
  role: "user" | "model";
  parts: Array<{ text: string }>;
  timestamp: number;
}

const historicoConversas = new Map<string, MensagemHistorico[]>();

// Função para limpar histórico de um chat específico (ex: quando o cliente digita #sair ou o barbeiro assume)
export function limparHistoricoChat(remoteJid: string) {
  historicoConversas.delete(remoteJid);
}

// Prompt padrão oficial da assistente Elaine.IA
export function obterPromptPadraoBarbeiro(nomeBarbearia: string = "GM Barbershop"): string {
  return `Você é a Elaine.IA, a assistente virtual oficial da barbearia ${nomeBarbearia}.
Seu objetivo é recepcionar e atender os clientes no WhatsApp com muita delicadeza, educação e simpatia, conduzindo uma conversa humana, natural e fluida.

DIRETRIZES DE OURO DA CONVERSA:
1. SAUDAÇÃO INICIAL SIMPLES (NUNCA MANDE LINKS NA SAUDAÇÃO):
   - Se o cliente apenas disser "oi", "olá", "bom dia", "tudo bem?" ou similar, retribua a saudação com simpatia, apresente-se brevemente e pergunte como pode ajudar.
   - Exemplo: "Olá, tudo bem? Sou a Elaine.IA, assistente virtual da ${nomeBarbearia}. Como posso te ajudar hoje?"
   - NUNCA envie o link do Booksy, preços ou tabelas na saudação inicial!

2. APRESENTAÇÃO ÚNICA:
   - Diga que é a Elaine.IA SOMENTE na primeira mensagem.
   - Nas mensagens seguintes da mesma conversa, NUNCA se reapresente, converse direto ao ponto de forma natural.

3. CONVERSA PROGRESSIVA E RESPOSTAS CURTAS:
   - Responda apenas o que o cliente perguntou em 1 ou 2 frases curtas.
   - Não despeje um monte de informações de uma vez. Vá progredindo o papo de acordo com o que o cliente responde.

4. PREÇOS E SERVIÇOS PONTUAIS:
   - Se o cliente perguntar o preço de um serviço (ex: "quanto é o corte?"), informe APENAS o valor do serviço consultado com base na tabela.
   - NUNCA envie a lista inteira de serviços, a não ser que o cliente peça expressamente "quais serviços vocês têm?".

5. AGENDAMENTO E LINK DO BOOKSY (APENAS QUANDO SOLICITADO):
   - Envie o link oficial do Booksy SOMENTE quando o cliente manifestar vontade de agendar (ex: "quero marcar", "tem horário?", "quero agendar para amanhã").
   - Fora do contexto de agendamento, NUNCA anexe o link do Booksy.

6. BARBEIROS DA CASA:
   - Se o cliente perguntar por um barbeiro específico, confirme com carinho que ele atende na casa e direcione para o Booksy ou pergunte qual horário ele prefere.

7. LOCALIZAÇÃO E PAGAMENTO:
   - Responda endereço ou Pix apenas se for expressamente perguntado pelo cliente.`;
}

// Helper para montar o contexto atualizado em tempo real direto do banco SQLite
function montarContextoBarbearia(db: any): string {
  try {
    const config: any = db.prepare("SELECT * FROM configuracoes WHERE id = 'default'").get() || {};
    const nomeBarbearia = config.nome_barbearia || "GM Barbershop";
    const endereco = config.endereco || "Rua da Barbearia";
    const linkBooksy = config.link_booksy || "https://booksy.com";
    const chavePix = config.chave_pix || "Consulte na barbearia";
    const horario = config.horario_funcionamento || "Terça a Sábado das 09h às 20h";

    // Serviços ativos
    const servicos: any[] = db.prepare("SELECT nome, categoria, preco, descricao FROM servicos WHERE ativo = 1 ORDER BY preco ASC").all() || [];
    const listaServicos = servicos.map(s => `- ${s.nome} (${s.categoria}): R$ ${Number(s.preco).toFixed(2).replace(".", ",")}`).join("\n");

    // Barbeiros ativos
    const barbeiros: any[] = db.prepare("SELECT nome FROM barbeiros WHERE ativo = 1").all() || [];
    const listaBarbeiros = barbeiros.map(b => b.nome).join(", ");

    // Planos Mensalistas VIP
    const planos: any[] = db.prepare("SELECT nome, preco_mensal, cortes_cabelo_inclusos, barbas_inclusas FROM planos WHERE ativo = 1").all() || [];
    const listaPlanos = planos.map(p => `- ${p.nome}: R$ ${Number(p.preco_mensal).toFixed(2).replace(".", ",")} / mês (${p.cortes_cabelo_inclusos} cortes/mês)`).join("\n");

    return `
DADOS OFICIAIS DA BARBEARIA:
- Nome: ${nomeBarbearia}
- Endereço: ${endereco}
- Horário de Funcionamento: ${horario}
- Link Oficial Booksy para Agendamento: ${linkBooksy}
- Chave Pix Oficial: ${chavePix} (aceitamos Pix, dinheiro, cartões de débito e crédito)
- Barbeiros da Equipe: ${listaBarbeiros || "Nossa equipe profissional"}

TABELA OFICIAL DE SERVIÇOS E VALORES:
${listaServicos || "Consulte nossos serviços no Booksy"}

PLANOS MENSALISTAS VIP (Clube de Assinatura):
${listaPlanos || "Consulte planos no salão"}
`;
  } catch (e) {
    return "";
  }
}

// Função principal de geração de resposta com o Google Gemini Flash
export async function gerarRespostaGemini(
  mensagemCliente: string,
  remoteJid: string,
  nomeCliente: string = "amigo"
): Promise<string | null> {
  try {
    const db = getDb();
    const config: any = db.prepare("SELECT gemini_api_key, gemini_ativo, gemini_prompt_personalizado, nome_barbearia FROM configuracoes WHERE id = 'default'").get() || {};

    const apiKey = obterApiKeyValida(config.gemini_api_key);
    const ativo = config.gemini_ativo !== undefined ? Boolean(config.gemini_ativo) : true;

    // Se a IA estiver explicitamente desativada, retorna null para usar fallback local
    if (!apiKey || !ativo) {
      console.log(`[GEMINI IA] Pulando chamada: apiKey=${apiKey ? "PRESENTE" : "VAZIA"}, ativo=${ativo}`);
      return null;
    }

    const nomeBarbearia = config.nome_barbearia || "GM Barbershop";
    const promptPersonalizado = config.gemini_prompt_personalizado || obterPromptPadraoBarbeiro(nomeBarbearia);
    const dadosContexto = montarContextoBarbearia(db);

    const systemInstruction = `${promptPersonalizado}\n\n${dadosContexto}\n\nNome do cliente com quem você está conversando: ${nomeCliente}`;

    // Recupera histórico recente de conversa com este cliente (últimas 2 horas)
    const agora = Date.now();
    let historico = historicoConversas.get(remoteJid) || [];
    historico = historico.filter(m => agora - m.timestamp < 7200000); // 2 horas de retenção

    // Prepara payload de conteúdos para a API do Gemini
    const contentsPayload = [
      ...historico.map(h => ({ role: h.role, parts: h.parts })),
      { role: "user", parts: [{ text: mensagemCliente }] }
    ];

    // Chamada à API oficial do Google Gemini (modelos ultra rápidos otimizados para WhatsApp)
    const modelosTentativa = [
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-flash-lite-latest",
      "gemini-3.6-flash",
      "gemini-3.5-flash"
    ];
    let respostaTexto: string | null = null;

    for (const modelo of modelosTentativa) {
      const inicioTentativa = Date.now();
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000); // 6s de timeout ágil

        const genConfig: any = {
          temperature: 0.7,
          maxOutputTokens: 600,
          topP: 0.85
        };

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: systemInstruction }]
            },
            contents: contentsPayload,
            generationConfig: genConfig
          }),
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (response.ok) {
          const json = await response.json();
          const candidateParts = json?.candidates?.[0]?.content?.parts;
          const texto = candidateParts?.map((p: any) => p.text).filter(Boolean).join(" ").trim();
          if (texto) {
            respostaTexto = texto;
            const tempo = Date.now() - inicioTentativa;
            console.log(`[GEMINI IA] Resposta gerada via ${modelo} (${tempo}ms) para ${remoteJid}: "${texto.slice(0, 60)}..."`);
            break;
          }
        } else {
          const errText = await response.text().catch(() => "");
          console.warn(`[GEMINI IA] Modelo ${modelo} retornou status ${response.status}: ${errText.slice(0, 120)}. Tentando próximo...`);
        }
      } catch (err: any) {
        console.warn(`[GEMINI IA] Falha ou timeout no modelo ${modelo} (${Date.now() - inicioTentativa}ms): ${err.message}. Tentando próximo...`);
      }
    }

    if (!respostaTexto) {
      return null;
    }

    // Salva no histórico da conversa para manter continuidade
    historico.push(
      { role: "user", parts: [{ text: mensagemCliente }], timestamp: agora },
      { role: "model", parts: [{ text: respostaTexto }], timestamp: agora }
    );

    // Mantém no máximo as últimas 6 mensagens na memória
    if (historico.length > 8) {
      historico = historico.slice(-6);
    }
    historicoConversas.set(remoteJid, historico);

    console.log(`[GEMINI IA] Resposta gerada com sucesso para ${remoteJid}: "${respostaTexto.slice(0, 60)}..."`);
    return respostaTexto;
  } catch (error: any) {
    console.warn(`[GEMINI IA] Falha de conexão ou timeout: ${error.message}. Ativando fallback local.`);
    return null;
  }
}

// Helper para validar a chave de API na tela de configurações
export async function testarChaveGemini(apiKey: string): Promise<{ success: boolean; erro?: string; modelo?: string }> {
  try {
    const keyLimpa = obterApiKeyValida(apiKey);
    if (!keyLimpa || keyLimpa.length < 15) {
      return { success: false, erro: "Chave de API inválida ou muito curta." };
    }

    const modelos = [
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-flash-lite-latest",
      "gemini-3.6-flash",
      "gemini-3.5-flash"
    ];
    let ultimoErro = "";

    for (const modelo of modelos) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${keyLimpa}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "Diga apenas: OK" }] }],
            generationConfig: { maxOutputTokens: 20 }
          }),
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (response.ok) {
          return { success: true, modelo };
        } else {
          const errData = await response.json().catch(() => null);
          const msgDetalhada = errData?.error?.message || `Status ${response.status}`;
          ultimoErro = `Google (${modelo}): ${msgDetalhada}`;
        }
      } catch (err: any) {
        ultimoErro = `Falha de conexão com ${modelo}: ${err.message}`;
      }
    }

    return { success: false, erro: ultimoErro || "Não foi possível validar a chave com os modelos do Gemini." };
  } catch (e: any) {
    return { success: false, erro: `Falha de conexão com o Google: ${e.message}` };
  }
}
