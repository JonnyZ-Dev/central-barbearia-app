import { getDb } from "./db";

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

// Prompt padrão com a persona perfeita de atendente de barbearia brasileira
export function obterPromptPadraoBarbeiro(nomeBarbearia: string = "GM Barbershop"): string {
  return `Você é o recepcionista virtual inteligente e gente boa da barbearia ${nomeBarbearia}.
Seu objetivo é atender clientes no WhatsApp de forma natural, acolhedora e amigável, exatamente como um barbeiro ou recepcionista real falaria.

DIRETRIZES FUNDAMENTAIS DE ESTILO:
1. RESPOSTAS ULTRA-CURTAS E DIRETAS: Responda em no máximo 1 ou 2 frases curtas. Jamais envie textões, relatórios ou listas longas com dezenas de emojis.
2. TOM HUMANO E BRASILEIRO: Use linguagem descontraída, educada e jovem típica de barbearia (ex: "Fala meu querido!", "Opa, tudo bem, irmão?", "Tranquilo por aí?").
3. AGENDAMENTO: Quando o cliente quiser agendar ou perguntar horários vagos, convide ele com simpatia e forneça o link oficial do Booksy para ele escolher o barbeiro e horário sem fila.
4. PREÇOS E SERVIÇOS: Quando perguntarem preço ou serviço, responda especificamente sobre o que foi perguntado (não cuspa a tabela inteira se ele só perguntou do corte).
5. ENDEREÇO E LOCALIZAÇÃO: Se perguntarem onde fica, informe o endereço com clareza.
6. PAGAMENTOS: Se perguntarem como pagar ou a chave Pix, informe a chave Pix oficial cadastrada.
7. BARBEIROS: Se perguntarem por um barbeiro específico, confirme que ele atende na casa e direcione para o Booksy ou avise que pode deixar um recado.
8. NÃO INVENTE: Use apenas as informações oficiais cadastradas fornecidas no contexto. Nunca invente preços, serviços ou dados inexistentes.
9. ATENDIMENTO HUMANO: Se o cliente tiver uma reclamação ou assunto muito específico, diga com carinho que avisou a equipe e que um barbeiro vai responder em breve.`;
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

    const apiKey = (config.gemini_api_key || "").trim();
    const ativo = config.gemini_ativo !== undefined ? Boolean(config.gemini_ativo) : true;

    // Se não tiver chave de API cadastrada ou a IA estiver desativada, retorna null para usar fallback local
    if (!apiKey || !ativo) {
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

    // Chamada à API oficial do Google Gemini (com suporte aos modelos mais recentes e fallback automático)
    const modelosTentativa = ["gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.8-flash", "gemini-1.5-flash"];
    let respostaTexto: string | null = null;

    for (const modelo of modelosTentativa) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4500); // Timeout rápido de 4.5 segundos para não atrasar o WhatsApp

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: systemInstruction }]
            },
            contents: contentsPayload,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1000,
              topP: 0.85,
              thinkingConfig: {
                thinkingBudget: 0
              }
            }
          }),
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (response.ok) {
          const json = await response.json();
          const candidateParts = json?.candidates?.[0]?.content?.parts;
          const texto = candidateParts?.find((p: any) => p.text)?.text?.trim() || candidateParts?.[0]?.text?.trim();
          if (texto) {
            respostaTexto = texto;
            break;
          }
        } else {
          console.warn(`[GEMINI IA] Modelo ${modelo} retornou status ${response.status}. Tentando próximo...`);
        }
      } catch (err: any) {
        console.warn(`[GEMINI IA] Erro ao consultar modelo ${modelo}: ${err.message}`);
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
    if (!apiKey || apiKey.trim().length < 15) {
      return { success: false, erro: "Chave de API inválida ou muito curta." };
    }

    const modelos = ["gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.8-flash", "gemini-1.5-flash"];
    let ultimoErro = "";

    for (const modelo of modelos) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey.trim()}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "Diga apenas: OK" }] }],
            generationConfig: {
              maxOutputTokens: 50,
              thinkingConfig: { thinkingBudget: 0 }
            }
          }),
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (response.ok) {
          return { success: true, modelo };
        } else {
          ultimoErro = `Google recusou com status ${response.status} no modelo ${modelo}`;
        }
      } catch (err: any) {
        ultimoErro = `Falha de conexão: ${err.message}`;
      }
    }

    return { success: false, erro: ultimoErro || "Não foi possível validar a chave com os modelos do Gemini." };
  } catch (e: any) {
    return { success: false, erro: `Falha de conexão com o Google: ${e.message}` };
  }
}
