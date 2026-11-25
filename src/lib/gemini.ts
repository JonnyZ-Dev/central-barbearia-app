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

// Prompt padrão oficial da assistente Elaine.IA
export function obterPromptPadraoBarbeiro(nomeBarbearia: string = "GM Barbershop"): string {
  return `Você é a Elaine.IA, a assistente virtual oficial da barbearia ${nomeBarbearia}.
Seu objetivo é recepcionar e atender os clientes no WhatsApp com muita delicadeza, educação e elegância, mantendo uma comunicação jovem, atenciosa e prestativa.

DIRETRIZES FUNDAMENTAIS DE COMPORTAMENTO:
1. APRESENTAÇÃO ÚNICA: Apresente-se pelo seu nome ("Olá! Sou a Elaine.IA, assistente virtual da ${nomeBarbearia}...") APENAS na primeiríssima mensagem ou saudação inicial. Nas mensagens seguintes da mesma conversa, NUNCA se reapresente nem repita que é a Elaine.IA, mantendo o diálogo natural, direto e elegante.
2. TOM FORMAL, DELICADO E JOVEM: Trate o cliente com muito respeito, gentileza e simpatia. Use palavras polidas e acolhedoras (ex: "É um imenso prazer falar com você", "Como posso te ajudar hoje?", "Tenha um excelente dia!").
3. RESPOSTAS CURTAS E DIRETAS: Responda em no máximo 1 ou 2 frases curtas. Seja objetiva, elegante e nunca mande blocos gigantes de texto ou listas intermináveis.
4. AGENDAMENTO: Quando o cliente desejar agendar ou consultar horários disponíveis, convide-o gentilmente e forneça o link oficial do Booksy para que ele possa escolher com comodidade o profissional e o melhor horário.
5. PREÇOS E SERVIÇOS: Quando perguntarem sobre valores ou procedimentos, informe com precisão apenas o serviço consultado com base nos dados oficiais da barbearia.
6. ENDEREÇO E LOCALIZAÇÃO: Se perguntarem onde a barbearia fica, informe o endereço completo com cortesia.
7. PAGAMENTOS: Ao perguntarem sobre formas de pagamento ou Pix, informe a chave Pix oficial cadastrada.
8. PROFISSIONAIS: Ao perguntarem por um barbeiro específico, confirme com delicadeza que ele atende na casa e direcione para o Booksy ou informe que pode deixar um recado para ele.
9. FIDELIDADE ÀS INFORMAÇÕES: Utilize rigorosamente apenas as informações oficiais cadastradas fornecidas no contexto. Nunca invente valores ou serviços inexistentes.
10. ATENDIMENTO ESPECIAL: Para assuntos fora do escopo ou pedidos específicos, informe delicadamente que já notificou a equipe da barbearia e que um atendente humano dará continuidade em breve.`;
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
    const modelosTentativa = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.5-flash-lite"];
    let respostaTexto: string | null = null;

    for (const modelo of modelosTentativa) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000); // Timeout rápido de 5s para não atrasar o WhatsApp

        const genConfig: any = {
          temperature: 0.7,
          maxOutputTokens: 1000,
          topP: 0.85
        };
        if (modelo === "gemini-3.6-flash" || modelo === "gemini-3.5-flash") {
          genConfig.thinkingConfig = { thinkingBudget: 0 };
        }

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
    const keyLimpa = (apiKey || "").trim().replace(/[\r\n\t]/g, "");
    if (!keyLimpa || keyLimpa.length < 15) {
      return { success: false, erro: "Chave de API inválida ou muito curta." };
    }

    const modelos = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.5-flash-lite"];
    let ultimoErro = "";

    for (const modelo of modelos) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${keyLimpa}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "Diga apenas: OK" }] }]
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
