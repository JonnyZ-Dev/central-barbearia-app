"use client";

import React, { useEffect, useState, useRef } from "react";
import { 
  Scissors, 
  Users, 
  MessageSquare, 
  Settings, 
  Calendar, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  Phone, 
  QrCode, 
  ExternalLink,
  Search,
  Sparkles,
  Database,
  Crown,
  DollarSign,
  Edit,
  Trash2,
  RefreshCw,
  Clock,
  Check,
  X,
  History,
  Download,
  Table,
  Layers,
  UserCheck,
  ShieldCheck,
  ChevronRight,
  Lock,
  Unlock,
  LogOut,
  KeyRound,
  Eye,
  EyeOff,
  ShieldAlert,
  RotateCcw,
  MapPin,
  Navigation,
  Bell,
  Send,
  Pause,
  Play,
  PauseCircle,
  FileSpreadsheet,
  Upload,
  FileDown,
  GitBranch,
  Bot,
  MessageCircle,
  Headphones,
  Filter
} from "lucide-react";
import { formatarTelefoneBR, validarTelefoneBR } from "@/lib/formatters";

const PROMPT_PADRAO_GEMINI = `Você é a Elaine.IA, a assistente virtual oficial da barbearia.
Seu objetivo é recepcionar e atender os clientes no WhatsApp com muita delicadeza, educação e elegância, mantendo uma comunicação jovem, atenciosa e prestativa.

DIRETRIZES FUNDAMENTAIS DE COMPORTAMENTO:
1. APRESENTAÇÃO ÚNICA: Apresente-se pelo seu nome ("Olá! Sou a Elaine.IA, assistente virtual da barbearia...") APENAS na primeiríssima mensagem ou saudação inicial. Nas mensagens seguintes da mesma conversa, NUNCA se reapresente nem repita que é a Elaine.IA, mantendo o diálogo natural, direto e elegante.
2. TOM FORMAL, DELICADO E JOVEM: Trate o cliente com muito respeito, gentileza e simpatia. Use palavras polidas e acolhedoras (ex: "É um imenso prazer falar com você", "Como posso te ajudar hoje?", "Tenha um excelente dia!").
3. RESPOSTAS CURTAS E DIRETAS: Responda em no máximo 1 ou 2 frases curtas. Seja objetiva, elegante e nunca mande blocos gigantes de texto ou listas intermináveis.
4. AGENDAMENTO: Quando o cliente desejar agendar ou consultar horários disponíveis, convide-o gentilmente e forneça o link oficial do Booksy para que ele possa escolher com comodidade o profissional e o melhor horário.
5. PREÇOS E SERVIÇOS: Quando perguntarem sobre valores ou procedimentos, informe com precisão apenas o serviço consultado com base nos dados oficiais da barbearia.
6. ENDEREÇO E LOCALIZAÇÃO: Se perguntarem onde a barbearia fica, informe o endereço completo com cortesia.
7. PAGAMENTOS: Ao perguntarem sobre formas de pagamento ou Pix, informe a chave Pix oficial cadastrada.
8. PROFISSIONAIS: Ao perguntarem por um barbeiro específico, confirme com delicadeza que ele atende na casa e direcione para o Booksy ou informe que pode deixar um recado para ele.
9. FIDELIDADE ÀS INFORMAÇÕES: Utilize rigorosamente apenas as informações oficiais cadastradas fornecidas no contexto. Nunca invente valores ou serviços inexistentes.
10. ATENDIMENTO ESPECIAL: Para assuntos fora do escopo ou pedidos específicos, informe delicadamente que já notificou a equipe da barbearia e que um atendente humano dará continuidade em breve.`;

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"mensalistas" | "conversas" | "planos" | "servicos" | "usuarios" | "whatsapp" | "banco" | "config">("mensalistas");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoriaFiltroServicos, setCategoriaFiltroServicos] = useState<string>("TODAS");
  const [buscaServico, setBuscaServico] = useState<string>("");
  const [feedback, setFeedback] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Modais
  const [modalNovoMensalista, setModalNovoMensalista] = useState(false);
  const [modalEditarMensalista, setModalEditarMensalista] = useState<any | null>(null);
  const [modalNovoPlano, setModalNovoPlano] = useState(false);
  const [modalEditarPlano, setModalEditarPlano] = useState<any | null>(null);
  const [modalNovoServico, setModalNovoServico] = useState(false);
  const [modalEditarServico, setModalEditarServico] = useState<any | null>(null);
  const [modalNovoBarbeiro, setModalNovoBarbeiro] = useState(false);
  const [modalEditarBarbeiro, setModalEditarBarbeiro] = useState<any | null>(null);
  const [modalHistorico, setModalHistorico] = useState<any | null>(null);
  const [modalImportarExcel, setModalImportarExcel] = useState(false);
  const [arquivoExcel, setArquivoExcel] = useState<File | null>(null);
  const [importandoExcel, setImportandoExcel] = useState(false);
  const [resultadoImportacao, setResultadoImportacao] = useState<any | null>(null);
  const [licencaInfo, setLicencaInfo] = useState<any | null>(null);
  const [checandoLicenca, setChecandoLicenca] = useState(false);

  // Estados de Atualização do Sistema (GitHub Auto-Updater)
  const [statusAtualizacao, setStatusAtualizacao] = useState<{
    configurado?: boolean;
    versaoAtual?: string;
    dataCommit?: string;
    remoteUrl?: string;
    temAtualizacao?: boolean;
    commitsAtras?: number;
    novidades?: string[];
    mensagem?: string;
    aviso?: string;
  } | null>(null);
  const [verificandoAtualizacao, setVerificandoAtualizacao] = useState(false);
  const [aplicandoAtualizacao, setAplicandoAtualizacao] = useState(false);

  // Estados da IA Google Gemini
  const [testandoGemini, setTestandoGemini] = useState(false);
  const [resultadoGemini, setResultadoGemini] = useState<{ success: boolean; msg: string } | null>(null);
  const [mostrarKeyGemini, setMostrarKeyGemini] = useState(false);

  // Estados do Gerenciador de Conversas & Atendimento (IA vs Humano)
  const [conversas, setConversas] = useState<any[]>([]);
  const [filtroStatusConversa, setFiltroStatusConversa] = useState<"TODAS" | "IA" | "HUMANO">("TODAS");
  const [buscaConversa, setBuscaConversa] = useState("");
  const [carregandoConversas, setCarregandoConversas] = useState(false);
  const [acaoConversaLoading, setAcaoConversaLoading] = useState<string | null>(null);

  // Sub-abas de Organização de Configurações
  const [subTabConfig, setSubTabConfig] = useState<"todas" | "perfil" | "ia" | "localizacao" | "horarios" | "automacoes" | "seguranca" | "atualizacoes">("todas");

  // Estados do WhatsApp e Robô
  const [botStatus, setBotStatus] = useState<{ status: string; qr: string | null; numero: string | null; pausado?: boolean }>({ status: "DESCONECTADO", qr: null, numero: null, pausado: false });
  const [pausandoBot, setPausandoBot] = useState(false);
  const [mensagensBot, setMensagensBot] = useState<any[]>([]);
  const [mensagemSelecionadaId, setMensagemSelecionadaId] = useState<string>("msg_boas_vindas");
  const [textoEditando, setTextoEditando] = useState<string>("");
  const [gatilhoEditando, setGatilhoEditando] = useState<string>("");
  const [categoriaFiltroBot, setCategoriaFiltroBot] = useState<string>("TODAS");
  const [modalNovaConversa, setModalNovaConversa] = useState(false);
  const [formNovaConversa, setFormNovaConversa] = useState({
    titulo: "",
    gatilho: "",
    categoria: "ATENDIMENTO",
    descricao: "",
    mensagem: ""
  });
  const [salvandoMensagem, setSalvandoMensagem] = useState(false);
  const [conectandoWhats, setConectandoWhats] = useState(false);
  const [atendimentosHumanos, setAtendimentosHumanos] = useState<any[]>([]);
  const [tabelaSelecionada, setTabelaSelecionada] = useState<string>("mensalistas");
  const [dadosTabela, setDadosTabela] = useState<{ columns: string[]; rows: any[] }>({ columns: [], rows: [] });
  const [carregandoTabela, setCarregandoTabela] = useState(false);

  // Estados de Autenticação / Proteção de Acesso
  const [autenticado, setAutenticado] = useState(false);
  const [verificandoAuth, setVerificandoAuth] = useState(true);
  const [senhaInput, setSenhaInput] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erroLogin, setErroLogin] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [novaSenhaAdmin, setNovaSenhaAdmin] = useState("");

  // Referência do textarea para inserção de variáveis dinâmicas na posição do cursor
  const textareaMensagemRef = useRef<HTMLTextAreaElement>(null);

  // Inserção inteligente da variável dinâmica no cursor
  const inserirVariavelMensagem = (tag: string) => {
    const textarea = textareaMensagemRef.current;
    if (!textarea) {
      setTextoEditando(prev => prev + " " + tag);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textoEditando.substring(0, start);
    const after = textoEditando.substring(end);

    const precisaEspacoAntes = before.length > 0 && !before.endsWith(" ") && !before.endsWith("\n");
    const precisaEspacoDepois = after.length > 0 && !after.startsWith(" ") && !after.startsWith("\n");

    const tagFormatada = (precisaEspacoAntes ? " " : "") + tag + (precisaEspacoDepois ? " " : "");
    const novoTexto = before + tagFormatada + after;

    setTextoEditando(novoTexto);

    setTimeout(() => {
      textarea.focus();
      const novoCursor = start + tagFormatada.length;
      textarea.setSelectionRange(novoCursor, novoCursor);
    }, 10);
  };

  // Formatador WhatsApp Markdown para visualização no balão de chat (bold, italic, strike, code)
  const formatarWhatsAppParaHtml = (txt: string) => {
    if (!txt) return "";
    let sanitizado = txt
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Negrito *texto*
    sanitizado = sanitizado.replace(/\*([^*\n]+)\*/g, '<strong class="font-bold text-white">$1</strong>');
    // Itálico _texto_
    sanitizado = sanitizado.replace(/_([^_\n]+)_/g, '<em class="italic text-zinc-300">$1</em>');
    // Tachado ~texto~
    sanitizado = sanitizado.replace(/~([^~\n]+)~/g, '<del class="line-through text-zinc-400">$1</del>');
    // Código ```bloco```
    sanitizado = sanitizado.replace(/```([^`]+)```/g, '<code class="bg-black/50 text-amber-300 px-1 py-0.5 rounded text-[10px] font-mono">$1</code>');

    return sanitizado;
  };

  // Formulário Plano
  const [formPlano, setFormPlano] = useState<any>({
    id: "",
    nome: "",
    preco_mensal: "",
    cortes_cabelo_inclusos: 4,
    barbas_inclusas: 0,
    inclui_sobrancelha: false,
    descricao: ""
  });

  // Formulário Serviço
  const [formServico, setFormServico] = useState<any>({
    id: "",
    nome: "",
    categoria: "Cabelo",
    preco: "",
    duracao_minutos: 30,
    descricao: ""
  });

  // Formulário Barbeiro
  const [formBarbeiro, setFormBarbeiro] = useState<any>({
    id: "",
    nome: "",
    telefone_whatsapp: "",
    email: "",
    tipo: "BARBEIRO"
  });

  // Formulário Novo Mensalista
  const [formMensalista, setFormMensalista] = useState({
    nome: "",
    whatsapp: "",
    plano_id: "",
    valor_pago: "",
    cortes_restantes: 4,
    barbas_restantes: 0,
    sobrancelhas_restantes: 0,
    data_vencimento: "",
    observacoes: ""
  });

  
  // Checagem de Licença e Trava de Inadimplência
  const checarLicenca = async (forcar: boolean = false) => {
    try {
      setChecandoLicenca(true);
      const res = await fetch(`/api/licenca${forcar ? "?forcar=true" : ""}`, { cache: "no-store" });
      const json = await res.json();
      setLicencaInfo(json);
      if (forcar) {
        if (json.ativa) {
          mostrarFeedback("Licença verificada e ativa no servidor!", "success");
        } else {
          mostrarFeedback("A licença continua suspensa no servidor.", "error");
        }
      }
    } catch (e) {
      console.error("Erro ao verificar licença:", e);
    } finally {
      setChecandoLicenca(false);
    }
  };

  // Checagem de Atualizações via GitHub
  const checarAtualizacoes = async (silencioso: boolean = false) => {
    try {
      if (!silencioso) setVerificandoAtualizacao(true);
      const res = await fetch("/api/sistema/atualizacoes");
      const json = await res.json();
      setStatusAtualizacao(json);
      if (!silencioso) {
        if (json.temAtualizacao) {
          mostrarFeedback(`Nova versão encontrada! (${json.commitsAtras} melhoria/ões)`);
        } else if (json.mensagem) {
          mostrarFeedback(json.mensagem);
        }
      }
    } catch (e) {
      if (!silencioso) mostrarFeedback("Erro ao verificar atualizações do GitHub", "error");
    } finally {
      if (!silencioso) setVerificandoAtualizacao(false);
    }
  };

  const aplicarAtualizacao = async () => {
    if (!confirm("Deseja baixar e aplicar as atualizações do sistema agora? O processo é automático e seguro.")) return;
    try {
      setAplicandoAtualizacao(true);
      const res = await fetch("/api/sistema/atualizacoes", { method: "POST" });
      const json = await res.json();
      if (json.sucesso) {
        mostrarFeedback("Atualizações aplicadas! Compilando nova versão... A tela atualizará sozinha assim que o servidor estiver pronto.", "success");
        // Aguarda 6 segundos iniciais e faz polling a cada 2s (ate 40 tentativas)
        setTimeout(() => {
          let tentativas = 0;
          const maxTentativas = 40;
          const timer = setInterval(async () => {
            tentativas++;
            try {
              const r = await fetch("/api/sistema/atualizacoes", { cache: "no-store" });
              if (r.ok) {
                clearInterval(timer);
                window.location.reload();
                return;
              }
            } catch (err) {
              // Servidor ainda recompilando ou inicializando
            }
            if (tentativas >= maxTentativas) {
              clearInterval(timer);
              window.location.reload();
            }
          }, 2000);
        }, 6000);
      } else {
        mostrarFeedback(json.erro || "Falha ao aplicar atualizações.", "error");
        setAplicandoAtualizacao(false);
      }
    } catch (e) {
      mostrarFeedback("Erro ao conectar ao atualizador.", "error");
      setAplicandoAtualizacao(false);
    }
  };

  const carregarDados = async () => {
    try {
      const res = await fetch("/api/dashboard");
      const json = await res.json();
      setData(json);
      if (json.planos?.length > 0 && !formMensalista.plano_id) {
        const p0 = json.planos[0];
        const hoje = new Date();
        hoje.setDate(hoje.getDate() + 30);
        setFormMensalista(prev => ({
          ...prev,
          plano_id: p0.id,
          valor_pago: p0.preco_mensal?.toString() || "0",
          cortes_restantes: p0.cortes_cabelo_inclusos || 4,
          barbas_restantes: p0.barbas_inclusas || 0,
          sobrancelhas_restantes: p0.inclui_sobrancelha ? 1 : 0,
          data_vencimento: hoje.toISOString().split("T")[0]
        }));
      }
    } catch (e) {
      console.error(e);
      mostrarFeedback("Erro ao carregar dados do servidor.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Verificar sessão do usuário no início
  const verificarSessao = async () => {
    try {
      const res = await fetch("/api/auth/verificar");
      const json = await res.json();
      if (json.autenticado) {
        setAutenticado(true);
        carregarDados();
      } else {
        setAutenticado(false);
        setLoading(false);
      }
    } catch (e) {
      setAutenticado(false);
      setLoading(false);
    } finally {
      setVerificandoAuth(false);
    }
  };

  useEffect(() => {
    verificarSessao();
    checarLicenca();
    const intervalLicenca = setInterval(() => {
      checarLicenca();
    }, 30000);
    return () => clearInterval(intervalLicenca);
  }, []);

  useEffect(() => {
    carregarConversas();
    verificarStatusWhats();
    const intervalConversas = setInterval(() => {
      carregarConversas();
      verificarStatusWhats();
    }, 4000);
    return () => clearInterval(intervalConversas);
  }, []);

  useEffect(() => {
    if (activeTab === "config") {
      checarAtualizacoes(true);
    }
  }, [activeTab]);

  useEffect(() => {
    if (data?.config?.nome_barbearia) {
      document.title = `${data.config.nome_barbearia} - Central & WhatsApp`;
    }
  }, [data?.config?.nome_barbearia]);

  // Login no sistema
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!senhaInput.trim()) {
      setErroLogin("Digite a senha de acesso.");
      return;
    }
    setErroLogin("");
    setEntrando(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha: senhaInput })
      });
      const json = await res.json();
      if (json.success) {
        setAutenticado(true);
        setSenhaInput("");
        setLoading(true);
        carregarDados();
        mostrarFeedback("Bem-vindo ao painel da barbearia!");
      } else {
        setErroLogin(json.error || "Senha incorreta!");
      }
    } catch (e) {
      setErroLogin("Erro ao conectar com o servidor.");
    } finally {
      setEntrando(false);
    }
  };

  // Logout / Bloquear painel
  const handleLogout = async () => {
    if (!confirm("Deseja bloquear o painel de acesso?")) return;
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setAutenticado(false);
      mostrarFeedback("Painel bloqueado com sucesso.");
    } catch (e) {}
  };

  const mostrarFeedback = (msg: string, type: "success" | "error" = "success") => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 5000);
  };

  // Carregar lista de conversas do WhatsApp (IA vs Humano)
  const carregarConversas = async (mostrarLoading = false) => {
    try {
      if (mostrarLoading) setCarregandoConversas(true);
      const res = await fetch("/api/whatsapp/conversas");
      const json = await res.json();
      if (json.success) {
        setConversas(json.conversas || []);
      }
    } catch (e) {
      // Falha silenciosa no polling
    } finally {
      if (mostrarLoading) setCarregandoConversas(false);
    }
  };

  // Alternar atendimento de uma conversa (Assumir Atendimento ou Passar para IA)
  const alternarAtendimentoConversa = async (
    remoteJid: string, 
    novoStatus: "HUMANO" | "IA", 
    nome?: string, 
    numero?: string
  ) => {
    setAcaoConversaLoading(remoteJid);
    try {
      const acao = novoStatus === "HUMANO" ? "ASSUMIR" : "PASSAR_PARA_IA";
      const res = await fetch("/api/whatsapp/conversas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, remoteJid, nome, numero })
      });
      const json = await res.json();
      if (json.success) {
        mostrarFeedback(json.message);
        carregarConversas();
      } else {
        mostrarFeedback(json.error || "Erro ao atualizar conversa", "error");
      }
    } catch (e: any) {
      mostrarFeedback("Erro ao conectar com o servidor: " + e.message, "error");
    } finally {
      setAcaoConversaLoading(null);
    }
  };

  // Carregar mensagens configuráveis do robô
  const carregarMensagensBot = async () => {
    try {
      const res = await fetch("/api/bot/mensagens");
      const json = await res.json();
      if (json.mensagens) {
        setMensagensBot(json.mensagens);
        const sel = json.mensagens.find((m: any) => m.id === mensagemSelecionadaId) || json.mensagens[0];
        if (sel) {
          setMensagemSelecionadaId(sel.id);
          setTextoEditando(sel.mensagem);
          setGatilhoEditando(sel.gatilho || "");
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Carregar status do WhatsApp e atendimentos humanos
  const verificarStatusWhats = async () => {
    try {
      const res = await fetch("/api/whatsapp");
      const json = await res.json();
      setBotStatus(json);
    } catch (e) {}
  };

  const carregarAtendimentosHumanos = async () => {
    try {
      const res = await fetch("/api/whatsapp/atendimentos");
      const json = await res.json();
      if (json.success) {
        setAtendimentosHumanos(json.atendimentos || []);
      }
    } catch (e) {}
  };

  const reativarRoboConversa = async (remoteJid: string) => {
    try {
      const res = await fetch("/api/whatsapp/atendimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remoteJid, acao: "REATIVAR" })
      });
      const json = await res.json();
      if (json.success) {
        mostrarFeedback("Robô reativado para este cliente com sucesso!");
        carregarAtendimentosHumanos();
      }
    } catch (e) {
      mostrarFeedback("Erro ao reativar robô", "error");
    }
  };

  useEffect(() => {
    if (activeTab === "whatsapp") {
      carregarMensagensBot();
      verificarStatusWhats();
      carregarAtendimentosHumanos();
      const interval = setInterval(() => {
        verificarStatusWhats();
        carregarAtendimentosHumanos();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const conectarWhats = async () => {
    setConectandoWhats(true);
    try {
      const res = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "CONECTAR" })
      });
      const json = await res.json();
      setBotStatus(json);
      mostrarFeedback("Iniciando conexão... Aguarde o QR Code.");
    } catch (e) {
      mostrarFeedback("Erro ao iniciar conexão com WhatsApp", "error");
    } finally {
      setConectandoWhats(false);
    }
  };

  
  // Alternar pausa temporária do robô (sem desconectar WhatsApp)
  const alternarPausaRobo = async (pausar: boolean) => {
    setPausandoBot(true);
    try {
      const res = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: pausar ? "PAUSAR" : "RETOMAR" })
      });
      const json = await res.json();
      if (json.status) {
        setBotStatus(json.status);
      } else {
        setBotStatus((prev) => ({ ...prev, pausado: pausar }));
      }
      mostrarFeedback(
        pausar 
          ? "Robô pausado com sucesso! Nenhuma mensagem automática será enviada." 
          : "Robô retomado com sucesso! Respostas automáticas e menu ativos.", 
        "success"
      );
    } catch (e) {
      mostrarFeedback("Erro ao alterar pausa do robô", "error");
    } finally {
      setPausandoBot(false);
    }
  };

  const desconectarWhats = async () => {
    if (!confirm("Deseja realmente desconectar o WhatsApp da barbearia?")) return;
    try {
      const res = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "DESCONECTAR" })
      });
      const json = await res.json();
      setBotStatus({ status: "DESCONECTADO", qr: null, numero: null });
      mostrarFeedback("WhatsApp desconectado.");
    } catch (e) {
      mostrarFeedback("Erro ao desconectar", "error");
    }
  };

  const salvarMensagemBot = async () => {
    setSalvandoMensagem(true);
    try {
      const res = await fetch("/api/bot/mensagens", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: mensagemSelecionadaId,
          mensagem: textoEditando,
          gatilho: gatilhoEditando,
          ativo: 1
        })
      });
      const json = await res.json();
      if (json.success) {
        mostrarFeedback("Mensagem e palavras-chave salvas no SQLite!");
        carregarMensagensBot();
      } else {
        mostrarFeedback(json.error, "error");
      }
    } catch (e) {
      mostrarFeedback("Erro ao salvar mensagem", "error");
    } finally {
      setSalvandoMensagem(false);
    }
  };

  // Cadastrar nova conversa personalizada
  const handleCriarConversa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNovaConversa.titulo.trim() || !formNovaConversa.mensagem.trim()) {
      mostrarFeedback("Título e texto da resposta são obrigatórios!", "error");
      return;
    }
    try {
      const res = await fetch("/api/bot/mensagens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formNovaConversa)
      });
      const json = await res.json();
      if (json.success) {
        mostrarFeedback("Nova conversa adicionada ao robô!");
        setModalNovaConversa(false);
        setFormNovaConversa({
          titulo: "",
          gatilho: "",
          categoria: "ATENDIMENTO",
          descricao: "",
          mensagem: ""
        });
        await carregarMensagensBot();
        if (json.id) {
          setMensagemSelecionadaId(json.id);
          setTextoEditando(formNovaConversa.mensagem);
          setGatilhoEditando(formNovaConversa.gatilho);
        }
      } else {
        mostrarFeedback(json.error, "error");
      }
    } catch (e) {
      mostrarFeedback("Erro ao cadastrar conversa", "error");
    }
  };

  // Excluir conversa personalizada
  const handleExcluirConversa = async (id: string, titulo: string) => {
    if (!confirm(`Deseja realmente remover a conversa "${titulo}" do robô?`)) return;
    try {
      const res = await fetch(`/api/bot/mensagens?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        mostrarFeedback("Conversa removida do robô!");
        await carregarMensagensBot();
        setMensagemSelecionadaId("msg_boas_vindas");
      } else {
        mostrarFeedback(json.error, "error");
      }
    } catch (e) {
      mostrarFeedback("Erro ao excluir conversa", "error");
    }
  };

  const restaurarPadraoMensagens = async () => {
    if (!confirm("Restaurar todas as mensagens para o modelo profissional padrão da GM?")) return;
    try {
      const res = await fetch("/api/bot/mensagens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "RESTAURAR_PADRAO" })
      });
      const json = await res.json();
      if (json.success) {
        mostrarFeedback(json.message);
        carregarMensagensBot();
      }
    } catch (e) {
      mostrarFeedback("Erro ao restaurar mensagens", "error");
    }
  };

  // Carregar dados de tabela no explorador do banco
  const carregarTabelaBanco = async (nomeTabela: string) => {
    setTabelaSelecionada(nomeTabela);
    setCarregandoTabela(true);
    try {
      const res = await fetch("/api/banco/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabela: nomeTabela })
      });
      const json = await res.json();
      setDadosTabela(json);
    } catch (e) {
      mostrarFeedback("Erro ao inspecionar tabela do banco", "error");
    } finally {
      setCarregandoTabela(false);
    }
  };

  useEffect(() => {
    if (activeTab === "banco") {
      carregarTabelaBanco(tabelaSelecionada);
    }
  }, [activeTab]);

  // Ações de Mensalistas (Baixa e Renovação)
  const executarBaixa = async (mensalistaId: string, tipoServico: "CABELO" | "BARBA" | "SOBRANCELHA" | "RENOVAR_CICLO", nomeCliente: string) => {
    const textoAcao = 
      tipoServico === "RENOVAR_CICLO" ? `Confirmar RENOVAÇÃO do mês (+30 dias e resetar créditos) para ${nomeCliente}?` :
      tipoServico === "CABELO" ? `Confirmar corte de CABELO para ${nomeCliente}?` :
      tipoServico === "BARBA" ? `Confirmar serviço de BARBA para ${nomeCliente}?` :
      `Confirmar SOBRANCELHA para ${nomeCliente}?`;

    if (!confirm(textoAcao)) return;

    try {
      const res = await fetch("/api/mensalistas/baixa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensalista_id: mensalistaId,
          tipo_servico: tipoServico,
          barbeiro_id: data.barbeiros?.[0]?.id || "barbeiro-gabriel"
        })
      });
      const result = await res.json();
      if (result.success) {
        mostrarFeedback(result.mensagem || "Operação realizada com sucesso!");
        carregarDados();
      } else {
        mostrarFeedback(result.error, "error");
      }
    } catch (e) {
      mostrarFeedback("Erro na comunicação com o servidor", "error");
    }
  };

  // Salvar Novo Mensalista
  
  // Importar planilha Excel de mensalistas
  const handleImportarExcel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!arquivoExcel) {
      mostrarFeedback("Selecione um arquivo Excel (.xlsx ou .csv) primeiro!", "error");
      return;
    }

    setImportandoExcel(true);
    setResultadoImportacao(null);

    try {
      const formData = new FormData();
      formData.append("file", arquivoExcel);

      const res = await fetch("/api/mensalistas/excel", {
        method: "POST",
        body: formData
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setResultadoImportacao(json);
        carregarDados();
        mostrarFeedback(json.message, "success");
      } else {
        mostrarFeedback(json.error || "Erro ao processar planilha", "error");
      }
    } catch (err: any) {
      mostrarFeedback("Erro na comunicação com o servidor", "error");
    } finally {
      setImportandoExcel(false);
    }
  };

  const handleCriarMensalista = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validarTelefoneBR(formMensalista.whatsapp)) {
      mostrarFeedback("WhatsApp inválido! Digite DDD + 9 dígitos reais (ex: (11) 99999-9999).", "error");
      return;
    }
    try {
      const res = await fetch("/api/mensalistas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formMensalista)
      });
      const json = await res.json();
      if (json.success) {
        mostrarFeedback("Cliente VIP cadastrado com sucesso!");
        setModalNovoMensalista(false);
        carregarDados();
      } else {
        mostrarFeedback(json.error, "error");
      }
    } catch (e) {
      mostrarFeedback("Erro ao salvar cliente VIP", "error");
    }
  };

  // Editar Mensalista
  const handleEditarMensalista = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validarTelefoneBR(modalEditarMensalista.whatsapp)) {
      mostrarFeedback("WhatsApp inválido! Digite DDD + 9 dígitos reais (ex: (11) 99999-9999).", "error");
      return;
    }
    try {
      const res = await fetch("/api/mensalistas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modalEditarMensalista)
      });
      const json = await res.json();
      if (json.success) {
        mostrarFeedback("Dados do cliente VIP atualizados!");
        setModalEditarMensalista(null);
        carregarDados();
      } else {
        mostrarFeedback(json.error, "error");
      }
    } catch (e) {
      mostrarFeedback("Erro ao atualizar dados", "error");
    }
  };

  // Excluir Mensalista
  const handleExcluirMensalista = async (id: string, nome: string) => {
    if (!confirm(`Tem certeza que deseja excluir o cadastro VIP de ${nome}?`)) return;
    try {
      const res = await fetch(`/api/mensalistas?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        mostrarFeedback(`Cliente ${nome} removido.`);
        carregarDados();
      } else {
        mostrarFeedback(json.error, "error");
      }
    } catch (e) {
      mostrarFeedback("Erro ao excluir", "error");
    }
  };

  // Salvar / Editar Plano
  const handleSalvarPlano = async (e: React.FormEvent, planoData: any, isEdicao: boolean) => {
    e.preventDefault();
    if (!planoData.nome || planoData.nome.trim().length < 2) {
      mostrarFeedback("Digite um nome válido para o plano (mínimo 2 letras).", "error");
      return;
    }
    if (!planoData.preco_mensal || Number(planoData.preco_mensal) <= 0) {
      mostrarFeedback("O preço mensal deve ser maior que zero.", "error");
      return;
    }
    try {
      const res = await fetch("/api/planos", {
        method: isEdicao ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(planoData)
      });
      const json = await res.json();
      if (json.success) {
        mostrarFeedback(isEdicao ? "Plano VIP atualizado!" : "Novo plano VIP criado com sucesso!");
        setModalNovoPlano(false);
        setModalEditarPlano(null);
        carregarDados();
      } else {
        mostrarFeedback(json.error, "error");
      }
    } catch (e) {
      mostrarFeedback("Erro ao salvar plano", "error");
    }
  };

  // Excluir Plano
  const handleExcluirPlano = async (id: string, nome: string) => {
    if (!confirm(`Excluir o plano ${nome}?`)) return;
    try {
      const res = await fetch(`/api/planos?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        mostrarFeedback("Plano excluído!");
        carregarDados();
      } else {
        mostrarFeedback(json.error, "error");
      }
    } catch (e) {
      mostrarFeedback("Erro ao excluir plano", "error");
    }
  };

  // Salvar / Editar Serviço
  const handleSalvarServico = async (e: React.FormEvent, servicoData: any, isEdicao: boolean) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/servicos", {
        method: isEdicao ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(servicoData)
      });
      const json = await res.json();
      if (json.success) {
        mostrarFeedback(isEdicao ? "Serviço atualizado!" : "Novo serviço cadastrado com sucesso!");
        setModalNovoServico(false);
        setModalEditarServico(null);
        carregarDados();
      } else {
        mostrarFeedback(json.error, "error");
      }
    } catch (e) {
      mostrarFeedback("Erro ao salvar serviço", "error");
    }
  };

  // Excluir Serviço
  const handleExcluirServico = async (id: string, nome: string) => {
    if (!confirm(`Remover serviço "${nome}"?`)) return;
    try {
      const res = await fetch(`/api/servicos?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        mostrarFeedback("Serviço removido.");
        carregarDados();
      } else {
        mostrarFeedback(json.error, "error");
      }
    } catch (e) {
      mostrarFeedback("Erro ao excluir", "error");
    }
  };

  // Salvar / Editar Barbeiro
  const handleSalvarBarbeiro = async (e: React.FormEvent, barbeiroData: any, isEdicao: boolean) => {
    e.preventDefault();
    if (!validarTelefoneBR(barbeiroData.telefone_whatsapp)) {
      mostrarFeedback("WhatsApp inválido! Digite DDD + 9 dígitos reais (ex: (11) 99999-9999).", "error");
      return;
    }
    if (!barbeiroData.nome || barbeiroData.nome.trim().length < 2) {
      mostrarFeedback("Digite o nome completo do barbeiro.", "error");
      return;
    }
    try {
      const res = await fetch("/api/usuarios", {
        method: isEdicao ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(barbeiroData)
      });
      const json = await res.json();
      if (json.success) {
        mostrarFeedback(isEdicao ? "Barbeiro atualizado!" : "Barbeiro cadastrado!");
        setModalNovoBarbeiro(false);
        setModalEditarBarbeiro(null);
        carregarDados();
      } else {
        mostrarFeedback(json.error, "error");
      }
    } catch (e) {
      mostrarFeedback("Erro ao salvar barbeiro", "error");
    }
  };

  // Excluir Barbeiro
  const handleExcluirBarbeiro = async (id: string, nome: string) => {
    if (!confirm(`Remover barbeiro ${nome}?`)) return;
    try {
      const res = await fetch(`/api/usuarios?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        mostrarFeedback("Barbeiro removido.");
        carregarDados();
      } else {
        mostrarFeedback(json.error, "error");
      }
    } catch (e) {
      mostrarFeedback("Erro ao excluir", "error");
    }
  };

  // Alteração Rápida do Nome da Barbearia pelo Header
  const salvarNomeBarbearia = async (novoNome: string) => {
    try {
      const payload: any = { ...data?.config, nome_barbearia: novoNome };
      const res = await fetch("/api/configuracoes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        setData((prev: any) => ({ ...prev, config: { ...prev.config, nome_barbearia: novoNome } }));
        mostrarFeedback(`Nome da barbearia atualizado para "${novoNome}"!`, "success");
      } else {
        mostrarFeedback(json.error || "Erro ao salvar nome", "error");
      }
    } catch {
      mostrarFeedback("Erro ao conectar com o servidor", "error");
    }
  };

  // Salvar Configurações
  const handleSalvarConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = { ...data.config };
      if (novaSenhaAdmin.trim()) {
        if (novaSenhaAdmin.trim().length < 4) {
          mostrarFeedback("A nova senha deve ter no mínimo 4 caracteres.", "error");
          return;
        }
        payload.senha_admin = novaSenhaAdmin.trim();
      }

      const res = await fetch("/api/configuracoes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        if (novaSenhaAdmin.trim()) {
          mostrarFeedback("Configurações salvas e nova senha de acesso atualizada!");
          setNovaSenhaAdmin("");
        } else {
          mostrarFeedback("Configurações da barbearia salvas!");
        }
        carregarDados();
      } else {
        mostrarFeedback(json.error, "error");
      }
    } catch (e) {
      mostrarFeedback("Erro ao salvar configurações", "error");
    }
  };

  // Testar conexão com a IA Google Gemini
  const testarChaveGemini = async () => {
    const key = data?.config?.gemini_api_key?.trim();
    if (!key) {
      mostrarFeedback("Informe uma chave de API do Google Gemini para testar.", "error");
      return;
    }
    setTestandoGemini(true);
    setResultadoGemini(null);
    try {
      const res = await fetch("/api/gemini/testar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key })
      });
      const json = await res.json();
      if (json.success) {
        setResultadoGemini({ success: true, msg: json.message || "Conexão com Google Gemini Flash estabelecida com sucesso!" });
        mostrarFeedback("Chave do Gemini validada com sucesso!");
      } else {
        setResultadoGemini({ success: false, msg: json.error || "Chave inválida ou erro na API do Google." });
        mostrarFeedback(json.error || "Falha no teste da chave do Gemini", "error");
      }
    } catch (e: any) {
      setResultadoGemini({ success: false, msg: "Erro ao comunicar com o servidor: " + (e?.message || e) });
      mostrarFeedback("Erro na requisição de teste", "error");
    } finally {
      setTestandoGemini(false);
    }
  };

  // Restaurar dados originais da GM
  const restaurarDadosGM = async () => {
    if (!confirm("Deseja importar todos os 28 serviços, barbeiros e planos originais da GM Barbershop para o SQLite?")) return;
    try {
      const res = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "RESETAR_DADOS_GM" })
      });
      const json = await res.json();
      if (json.success) {
        mostrarFeedback(json.message);
        carregarDados();
        if (activeTab === "banco") carregarTabelaBanco(tabelaSelecionada);
      }
    } catch (e) {
      mostrarFeedback("Erro ao importar dados GM", "error");
    }
  };

  if (verificandoAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-400">
        <div className="flex flex-col items-center gap-3">
          <Scissors className="w-10 h-10 animate-spin text-amber-500" />
          <p className="font-medium text-zinc-300">Verificando segurança...</p>
        </div>
      </div>
    );
  }

  // TELA DE TRAVA DE LICENÇA (INADIMPLÊNCIA / BLOQUEIO REMOTO VIA SUPABASE)
  if (licencaInfo && !licencaInfo.ativa) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950 p-4 relative overflow-hidden font-sans select-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-red-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="w-full max-w-lg bg-zinc-900/95 border border-red-500/30 rounded-3xl p-8 backdrop-blur-xl shadow-2xl relative z-10 space-y-6 animate-fade-in text-center">
          
          <div className="w-20 h-20 rounded-3xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mx-auto shadow-inner">
            <ShieldAlert className="w-10 h-10 text-red-500 animate-pulse" />
          </div>

          <div>
            <span className="text-[11px] font-black uppercase tracking-widest text-red-400 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20">
              Licença Suspensa
            </span>
            <h1 className="text-2xl font-black text-white tracking-tight mt-3">
              Acesso ao Sistema Suspenso
            </h1>
            <p className="text-xs text-zinc-400 mt-1 font-medium">
              {licencaInfo.cliente || "GM Barbershop"} • Chave: <span className="font-mono text-zinc-300">{licencaInfo.chave}</span>
            </p>
          </div>

          <div className="bg-zinc-950/80 p-4 rounded-2xl border border-zinc-800 text-xs text-zinc-300 leading-relaxed text-left">
            <p>{licencaInfo.mensagem || "Sua licença de uso do sistema está temporariamente suspensa por pendência na mensalidade."}</p>
          </div>

          {licencaInfo.pix && (
            <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-2 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  Chave Pix para Regularização:
                </span>
                {licencaInfo.valor && (
                  <span className="text-xs font-black text-white bg-zinc-800 px-2 py-0.5 rounded-md">
                    R$ {Number(licencaInfo.valor).toFixed(2)}/mês
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 p-2.5 bg-zinc-900 rounded-xl border border-zinc-800 font-mono text-sm text-white select-all">
                <span>{licencaInfo.pix}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(licencaInfo.pix);
                    mostrarFeedback("Chave Pix copiada para a área de transferência!", "success");
                  }}
                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-bold rounded-lg transition"
                >
                  Copiar
                </button>
              </div>
              <p className="text-[11px] text-zinc-500">
                Após transferir, envie o comprovante para o suporte e clique no botão abaixo para desbloquear seu sistema imediatamente.
              </p>
            </div>
          )}

          <button
            onClick={() => checarLicenca(true)}
            disabled={checandoLicenca}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-black py-3 rounded-2xl font-black text-sm uppercase tracking-wider transition shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${checandoLicenca ? "animate-spin" : ""}`} />
            {checandoLicenca ? "Verificando com o Servidor..." : "Já Paguei • Desbloquear Sistema"}
          </button>

        </div>
      </div>
    );
  }

  // TELA DE BLOQUEIO / LOGIN (ACESSO RESTRITO CONTRA CURIOSOS)
  if (!autenticado) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950 p-4 relative overflow-hidden font-sans select-none">
        {/* Efeito de luz dourada sutil de fundo */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className="w-full max-w-md bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-8 backdrop-blur-xl shadow-2xl relative z-10 space-y-6">
          
          {/* Logo e Cabeçalho */}
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto shadow-inner">
              <Scissors className="w-8 h-8" />
            </div>
            
            <div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">
                {data?.config?.nome_barbearia || "GM Barbershop"}
              </h1>
              <p className="text-xs text-zinc-400 mt-1 flex items-center justify-center gap-1.5 font-medium">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                Painel Administrativo • Acesso Restrito
              </p>
            </div>
          </div>

          {/* Formulário de Senha */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block mb-2">
                Senha de Acesso do Administrador:
              </label>

              <div className="relative">
                <input
                  type={mostrarSenha ? "text" : "password"}
                  value={senhaInput}
                  onChange={(e) => setSenhaInput(e.target.value)}
                  placeholder="Digite sua senha de acesso..."
                  autoFocus
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500 font-mono tracking-wider pr-11 transition shadow-inner"
                />

                <button
                  type="button"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition"
                >
                  {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {erroLogin && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{erroLogin}</span>
              </div>
            )}


            <button
              type="submit"
              disabled={entrando}
              className="w-full bg-amber-500 hover:bg-amber-400 text-black py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-amber-500/10 active:scale-95"
            >
              {entrando ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Verificando...
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4" /> Entrar no Painel
                </>
              )}

            </button>
          </form>

          {/* Dica de Segurança e Primeiro Acesso */}
          <div className="pt-2 border-t border-zinc-800/80 text-center space-y-1">
            <span className="text-[11px] text-zinc-500 block">
              🛡️ Proteção ativa contra curiosos na rede Wi-Fi local
            </span>
            <span className="text-[10px] text-zinc-600 block">
              Senha padrão inicial: <strong className="text-zinc-400 font-mono">admin123</strong> (alterável nas configurações)
            </span>
          </div>

        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-400">
        <div className="flex flex-col items-center gap-3">
          <Scissors className="w-10 h-10 animate-spin text-amber-500" />
          <p className="font-medium text-zinc-300">Carregando Central de Mensalistas & Bot...</p>
          <span className="text-xs text-zinc-500">Conectando ao banco SQLite local</span>
        </div>
      </div>
    );
  }

  // Cálculos de Resumo
  const totalMensalistasAtivos = data?.mensalistas?.filter((m: any) => m.status === "ATIVO")?.length || 0;
  const faturamentoRecorrente = data?.mensalistas?.reduce((acc: number, m: any) => acc + Number(m.valor_pago || 0), 0) || 0;
  const totalCortesPendentes = data?.mensalistas?.reduce((acc: number, m: any) => acc + Number(m.cortes_restantes || 0), 0) || 0;
  const totalBarbasPendentes = data?.mensalistas?.reduce((acc: number, m: any) => acc + Number(m.barbas_restantes || 0), 0) || 0;

  // Filtro de Mensalistas
  const mensalistasFiltrados = data?.mensalistas?.filter((m: any) => 
    m.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.whatsapp?.includes(searchTerm)
  ) || [];

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans selection:bg-amber-500 selection:text-black">
      
      {/* SIDEBAR DE NAVEGAÇÃO */}
      <aside className="w-64 border-r border-zinc-800/80 bg-zinc-900/40 p-5 flex flex-col justify-between select-none">
        <div className="space-y-6">
          
          {/* Logo e Nome da Barbearia */}
          <div className="flex items-center gap-3 px-1 group">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner flex-shrink-0">
              <Scissors className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div 
                onClick={() => {
                  const atual = data?.config?.nome_barbearia || "GM Barbershop";
                  const novo = prompt("Digite o novo nome da Barbearia:", atual);
                  if (novo && novo.trim() && novo.trim() !== atual) {
                    salvarNomeBarbearia(novo.trim());
                  }
                }}
                className="cursor-pointer group/title flex items-center gap-1.5"
                title="Clique aqui para editar o nome da barbearia"
              >
                <h1 className="font-extrabold text-sm tracking-tight text-white leading-tight truncate group-hover/title:text-amber-400 transition">
                  {data?.config?.nome_barbearia || "GM Barbershop"}
                </h1>
                <Edit className="w-3.5 h-3.5 text-zinc-500 group-hover/title:text-amber-400 opacity-60 group-hover/title:opacity-100 transition flex-shrink-0" />
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  SQLite Local Ativo
                </span>
                <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-1.5 py-0.5 rounded font-mono font-bold tracking-wide animate-pulse">
                  v2.7.0 • INTELIGÊNCIA ARTIFICIAL GEMINI PRONTA
                </span>
              </div>
            </div>
          </div>

          {/* Menus */}
          <nav className="space-y-1 text-sm font-medium">
            <button 
              onClick={() => setActiveTab("mensalistas")}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition ${
                activeTab === "mensalistas" ? "bg-amber-500 text-black font-bold shadow-lg shadow-amber-500/20" : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
              }`}
            >
              <div className="flex items-center gap-3">
                <Crown className="w-4 h-4" />
                Clientes VIPs
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${activeTab === "mensalistas" ? "bg-black/20 text-black" : "bg-zinc-800 text-zinc-400"}`}>
                {data?.mensalistas?.length || 0}
              </span>
            </button>

            <button 
              onClick={() => setActiveTab("planos")}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition ${
                activeTab === "planos" ? "bg-amber-500 text-black font-bold shadow-lg shadow-amber-500/20" : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
              }`}
            >
              <div className="flex items-center gap-3">
                <Layers className="w-4 h-4" />
                Planos de Assinatura
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${activeTab === "planos" ? "bg-black/20 text-black" : "bg-zinc-800 text-zinc-400"}`}>
                {data?.planos?.length || 0}
              </span>
            </button>

            <button 
              onClick={() => setActiveTab("servicos")}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition ${
                activeTab === "servicos" ? "bg-amber-500 text-black font-bold shadow-lg shadow-amber-500/20" : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
              }`}
            >
              <div className="flex items-center gap-3">
                <Scissors className="w-4 h-4" />
                Serviços & Preços
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${activeTab === "servicos" ? "bg-black/20 text-black" : "bg-zinc-800 text-zinc-400"}`}>
                {data?.servicos?.length || 0}
              </span>
            </button>

            <button 
              onClick={() => setActiveTab("usuarios")}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition ${
                activeTab === "usuarios" ? "bg-amber-500 text-black font-bold shadow-lg shadow-amber-500/20" : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
              }`}
            >
              <div className="flex items-center gap-3">
                <Users className="w-4 h-4" />
                Equipe / Barbeiros
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${activeTab === "usuarios" ? "bg-black/20 text-black" : "bg-zinc-800 text-zinc-400"}`}>
                {data?.barbeiros?.length || 0}
              </span>
            </button>

            <button 
              onClick={() => setActiveTab("conversas")}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition ${
                activeTab === "conversas" ? "bg-amber-500 text-black font-bold shadow-lg shadow-amber-500/20" : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
              }`}
            >
              <div className="flex items-center gap-3">
                <MessageCircle className="w-4 h-4" />
                Conversas & IA
              </div>
              {conversas.filter(c => c.status === "HUMANO").length > 0 ? (
                <span className="text-[10px] bg-amber-500 text-black font-extrabold px-2 py-0.5 rounded-full animate-pulse flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-black"></span>
                  {conversas.filter(c => c.status === "HUMANO").length} em pausa
                </span>
              ) : (
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${activeTab === "conversas" ? "bg-black/20 text-black" : "bg-zinc-800 text-zinc-400"}`}>
                  {conversas.length}
                </span>
              )}
            </button>

            <button 
              onClick={() => setActiveTab("whatsapp")}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition ${
                activeTab === "whatsapp" ? "bg-amber-500 text-black font-bold shadow-lg shadow-amber-500/20" : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
              }`}
            >
              <div className="flex items-center gap-3">
                <MessageSquare className="w-4 h-4" />
                Robô do WhatsApp
              </div>
              <span className="flex items-center gap-1.5">
                {botStatus.status === "CONECTADO" ? (
                  botStatus.pausado ? (
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full font-bold">
                      Pausa
                    </span>
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50"></span>
                  )
                ) : botStatus.status === "AGUARDANDO_QR" ? (
                  <span className="text-[10px] bg-amber-500 text-black px-1.5 py-0.5 rounded-full font-black animate-pulse">
                    QR Code
                  </span>
                ) : (
                  <span className="text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700 px-1.5 py-0.5 rounded-full font-medium">
                    Desconectado
                  </span>
                )}
              </span>
            </button>

            <button 
              onClick={() => setActiveTab("banco")}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition ${
                activeTab === "banco" ? "bg-amber-500 text-black font-bold shadow-lg shadow-amber-500/20" : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
              }`}
            >
              <div className="flex items-center gap-3">
                <Database className="w-4 h-4" />
                Banco de Dados
              </div>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                .db
              </span>
            </button>

            <button 
              onClick={() => setActiveTab("config")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition ${
                activeTab === "config" ? "bg-amber-500 text-black font-bold shadow-lg shadow-amber-500/20" : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
              }`}
            >
              <Settings className="w-4 h-4" />
              Configurações
            </button>
          </nav>
        </div>

        {/* Rodapé da Sidebar - Atalho Booksy */}
        <div className="space-y-2">
          {/* Card do Usuário Logado e Botão de Bloqueio */}
          <div className="bg-zinc-950/80 p-3 rounded-2xl border border-zinc-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">Admin GM</div>
                <div className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Conectado
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition flex items-center gap-1"
              title="Bloquear Painel / Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-zinc-950/80 p-3.5 rounded-2xl border border-zinc-800/80 text-xs">
            <div className="text-zinc-400 text-[11px] mb-1 font-medium">Booksy Oficial Integrado:</div>
            <a 
              href={data?.config?.link_booksy || "https://booksy.com"} 
              target="_blank" 
              className="text-amber-400 hover:underline flex items-center gap-1.5 font-bold truncate"
            >
              Abrir Booksy da GM <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </a>
          </div>

          {/* Badge de Licença Oficial Ativa */}
          <div className="bg-zinc-950/80 p-3 rounded-2xl border border-zinc-800/80 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[11px] font-bold text-zinc-300">Licença Oficial Ativa</span>
            </div>
            <button
              onClick={() => checarLicenca(true)}
              disabled={checandoLicenca}
              className="text-zinc-500 hover:text-amber-400 transition"
              title="Sincronizar licença com o servidor"
            >
              <RefreshCw className={`w-3 h-3 ${checandoLicenca ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Card de Acesso Wi-Fi / Celular na Barbearia */}
          {data?.rede?.ipLocal && data.rede.ipLocal !== "localhost" && (
            <div className="bg-zinc-950/80 p-3 rounded-2xl border border-zinc-800/80 text-xs space-y-1">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span className="font-bold flex items-center gap-1.5 text-zinc-300">
                  <Phone className="w-3 h-3 text-amber-400" /> Acesso no Celular
                </span>
                <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono">Mesmo Wi-Fi</span>
              </div>
              <div className="flex items-center justify-between gap-1 pt-0.5">
                <span className="text-[11px] font-mono font-bold text-amber-400 truncate select-all">
                  {data.rede.urlAcessoCelular}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(data.rede.urlAcessoCelular);
                    mostrarFeedback("Link de acesso móvel copiado!", "success");
                  }}
                  className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px] font-bold transition"
                  title="Copiar Link para o Celular"
                >
                  Copiar
                </button>
              </div>
            </div>
          )}


        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 overflow-y-auto p-8 space-y-6">

        {/* FEEDBACK BANNER */}
        {feedback && (
          <div className={`p-4 rounded-2xl border text-sm flex items-center justify-between animate-fade-in shadow-lg ${
            feedback.type === "success" 
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 shadow-emerald-500/5" 
              : "bg-red-500/10 border-red-500/30 text-red-300 shadow-red-500/5"
          }`}>
            <span className="flex items-center gap-2 font-medium">
              {feedback.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {feedback.msg}
            </span>
            <button onClick={() => setFeedback(null)} className="text-xs opacity-75 hover:opacity-100 p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}


        {/* ======================================================== */}
        {/* ABA 1: CLIENTES VIPS / MENSALISTAS                       */}
        {/* ======================================================== */}
        {activeTab === "mensalistas" && (
          <div className="space-y-6">
            
            {/* Header com Resumo */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                  <Crown className="w-6 h-6 text-amber-400" /> Clube de Clientes VIPs
                </h2>
                <p className="text-sm text-zinc-400 mt-0.5">
                  Gestão de assinantes, controle individual de cortes e barbas com baixa em 1 clique
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setModalNovoMensalista(true)}
                  className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2.5 rounded-xl font-extrabold text-sm flex items-center gap-2 transition shadow-lg shadow-emerald-500/20 active:scale-95"
                >
                  <Plus className="w-4 h-4" /> Novo Cliente VIP
                </button>
              </div>
            </div>

            {/* Cards de Métricas */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800/80">
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Assinantes Ativos</div>
                <div className="text-2xl font-extrabold text-white mt-1">{totalMensalistasAtivos}</div>
              </div>
              <div className="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800/80">
                <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Recorrência Mensal</div>
                <div className="text-2xl font-extrabold text-amber-400 mt-1">R$ {faturamentoRecorrente.toFixed(2)}</div>
              </div>
              <div className="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800/80">
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Cortes a Realizar</div>
                <div className="text-2xl font-extrabold text-zinc-200 mt-1">{totalCortesPendentes} cortes</div>
              </div>
              <div className="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800/80">
                <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Barbas a Realizar</div>
                <div className="text-2xl font-extrabold text-zinc-200 mt-1">{totalBarbasPendentes} barbas</div>
              </div>
            </div>

            {/* Barra de Pesquisa & Botões de Importar/Exportar Excel */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-zinc-500" />
                <input 
                  type="text" 
                  placeholder="Buscar assinante por nome ou celular..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition"
                />
              </div>

              {/* Botões de Ação Excel (Importar, Exportar, Baixar Modelo) */}
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href="/api/mensalistas/excel?tipo=modelo"
                  download="modelo_clientes_vip_gm.xlsx"
                  className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                  title="Baixar planilha modelo preenchível (.xlsx)"
                >
                  <FileDown className="w-3.5 h-3.5 text-zinc-400" /> Baixar Modelo
                </a>

                <a
                  href="/api/mensalistas/excel?tipo=exportar"
                  download="clientes_vips_gm.xlsx"
                  className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-emerald-400 border border-zinc-800 hover:border-emerald-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
                  title="Exportar todos os clientes cadastrados para uma planilha Excel (.xlsx)"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" /> Exportar Excel
                </a>

                <button
                  type="button"
                  onClick={() => {
                    setArquivoExcel(null);
                    setResultadoImportacao(null);
                    setModalImportarExcel(true);
                  }}
                  className="px-3.5 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm active:scale-95"
                  title="Importar ou atualizar clientes a partir de uma planilha Excel (.xlsx ou .csv)"
                >
                  <Upload className="w-3.5 h-3.5 text-emerald-400" /> Importar Excel
                </button>
              </div>
            </div>

            {/* Grid de Cards de Mensalistas */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {mensalistasFiltrados.length === 0 ? (
                <div className="col-span-full py-16 text-center text-zinc-500 text-sm">
                  Nenhum cliente VIP encontrado. Clique em "+ Novo Cliente VIP" para cadastrar o primeiro!
                </div>
              ) : (
                mensalistasFiltrados.map((m: any) => {
                  const diasRestantes = Math.ceil((new Date(m.data_vencimento).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                  const vencido = diasRestantes < 0;
                  const vencendo = diasRestantes >= 0 && diasRestantes <= 5;

                  return (
                    <div key={m.id} className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800/80 flex flex-col justify-between hover:border-zinc-700 transition space-y-4 shadow-sm">
                      
                      {/* Topo do Card */}
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-bold text-white text-base leading-snug">{m.nome}</h3>
                            <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1">
                              <Phone className="w-3 h-3 text-emerald-400" /> {m.whatsapp}
                            </p>
                          </div>
                          
                          <div className="text-right">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400 block mb-1">
                              {m.plano_nome || "VIP"}
                            </span>
                            <span className="text-[11px] text-zinc-400 font-semibold">
                              R$ {Number(m.valor_pago || 0).toFixed(2)}/mês
                            </span>
                          </div>
                        </div>

                        {/* Status de Vencimento */}
                        <div className="mt-3 flex items-center justify-between text-xs py-1.5 px-3 rounded-xl bg-zinc-950/70 border border-zinc-800/60">
                          <span className="text-zinc-400 flex items-center gap-1.5">
                            <Calendar className="w-3 h-3" /> Vencimento: {m.data_vencimento}
                          </span>
                          <span className={`font-bold ${vencido ? 'text-red-400' : vencendo ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {vencido ? `Venceu há ${Math.abs(diasRestantes)} dias` : vencendo ? `Vence em ${diasRestantes} dias` : `${diasRestantes} dias rest.`}
                          </span>
                        </div>

                        {/* Saldos de Cabelo, Barba e Sobrancelha */}
                        <div className="grid grid-cols-3 gap-2 mt-3">
                          
                          {/* Saldo Cabelo */}
                          <div className="bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800/80 text-center flex flex-col justify-between">
                            <div>
                              <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider truncate">Cortes Cabelo</div>
                              <div className="text-xl font-extrabold text-white mt-0.5">
                                {m.cortes_restantes}
                              </div>
                            </div>
                            <button
                              onClick={() => executarBaixa(m.id, "CABELO", m.nome)}
                              disabled={m.cortes_restantes <= 0}
                              className={`w-full mt-2 py-1 px-1 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition ${
                                m.cortes_restantes > 0 
                                  ? "bg-amber-500 hover:bg-amber-400 text-black shadow-sm" 
                                  : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                              }`}
                            >
                              <Scissors className="w-3 h-3 shrink-0" /> -1 Corte
                            </button>
                          </div>

                          {/* Saldo Barba */}
                          <div className="bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800/80 text-center flex flex-col justify-between">
                            <div>
                              <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider truncate">Barba</div>
                              <div className="text-xl font-extrabold text-white mt-0.5">
                                {m.barbas_restantes}
                              </div>
                            </div>
                            <button
                              onClick={() => executarBaixa(m.id, "BARBA", m.nome)}
                              disabled={m.barbas_restantes <= 0}
                              className={`w-full mt-2 py-1 px-1 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition ${
                                m.barbas_restantes > 0 
                                  ? "bg-emerald-500 hover:bg-emerald-400 text-black shadow-sm" 
                                  : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                              }`}
                            >
                              <Scissors className="w-3 h-3 shrink-0" /> -1 Barba
                            </button>
                          </div>

                          {/* Saldo Sobrancelha */}
                          <div className="bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800/80 text-center flex flex-col justify-between">
                            <div>
                              <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider truncate">Sobrancelha</div>
                              <div className="text-xl font-extrabold text-white mt-0.5">
                                {m.sobrancelhas_restantes || 0}
                              </div>
                            </div>
                            <button
                              onClick={() => executarBaixa(m.id, "SOBRANCELHA", m.nome)}
                              disabled={(m.sobrancelhas_restantes || 0) <= 0}
                              className={`w-full mt-2 py-1 px-1 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition ${
                                (m.sobrancelhas_restantes || 0) > 0 
                                  ? "bg-purple-500 hover:bg-purple-400 text-white shadow-sm" 
                                  : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                              }`}
                            >
                              <Sparkles className="w-3 h-3 shrink-0" /> -1 Sobr.
                            </button>
                          </div>

                        </div>

                        {/* Observações / Detalhes adicionais */}
                        {m.observacoes && (
                          <p className="text-[11px] text-zinc-500 mt-2 italic line-clamp-1">
                            "{m.observacoes}"
                          </p>
                        )}

                      </div>

                      {/* Botões de Ação do Card */}
                      <div className="border-t border-zinc-800/80 pt-3 flex items-center justify-between gap-1 text-xs">
                        <button
                          onClick={() => executarBaixa(m.id, "RENOVAR_CICLO", m.nome)}
                          className="text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 p-1 hover:bg-amber-500/10 rounded-lg transition"
                          title="Recarrega cortes do plano e adiciona +30 dias"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Renovar Mês
                        </button>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setModalEditarMensalista(m)}
                            className="text-zinc-400 hover:text-white p-1.5 hover:bg-zinc-800 rounded-lg transition"
                            title="Editar Dados Completos"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleExcluirMensalista(m.id, m.nome)}
                            className="text-zinc-500 hover:text-red-400 p-1.5 hover:bg-red-500/10 rounded-lg transition"
                            title="Excluir Mensalista"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                    </div>
                  );
                })
              )}

            </div>

            {/* Histórico Recente de Baixas de Cortes */}
            <div className="bg-zinc-900/40 p-5 rounded-2xl border border-zinc-800/80 space-y-3">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <History className="w-4 h-4 text-amber-400" /> Últimas Baixas de Cortes e Serviços Registradas
              </h3>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {data?.historico?.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-3">Nenhum corte registrado ainda.</p>
                ) : (
                  data?.historico?.map((h: any) => (
                    <div key={h.id} className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/60 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                          h.tipo_servico === 'CABELO' ? 'bg-amber-500/20 text-amber-300' :
                          h.tipo_servico === 'BARBA' ? 'bg-emerald-500/20 text-emerald-300' :
                          h.tipo_servico === 'SOBRANCELHA' ? 'bg-purple-500/20 text-purple-300' :
                          h.tipo_servico === 'RENOVACAO_PLANO' ? 'bg-blue-500/20 text-blue-300' :
                          'bg-zinc-800 text-zinc-300'
                        }`}>
                          {h.tipo_servico}
                        </span>
                        <strong className="text-white">{h.mensalista_nome || "Cliente"}</strong>
                        <span className="text-zinc-500">atendido por {h.barbeiro_nome || "Gabriel"}</span>
                      </div>
                      <span className="text-zinc-400 font-mono text-[11px]">{h.data_corte}</span>
                    </div>
                  ))
                )}

              </div>
            </div>

          </div>
        )}


        {/* ======================================================== */}
        {/* ABA 2: PLANOS DE ASSINATURA                              */}
        {/* ======================================================== */}
        {activeTab === "planos" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                  <Layers className="w-6 h-6 text-amber-400" /> Planos de Assinatura VIP
                </h2>
                <p className="text-sm text-zinc-400 mt-0.5">
                  Crie e edite as opções de planos mensais (cortes, barbas, sobrancelha e valor)
                </p>
              </div>

              <button 
                onClick={() => {
                  setFormPlano({
                    id: "",
                    nome: "",
                    preco_mensal: "",
                    cortes_cabelo_inclusos: 4,
                    barbas_inclusas: 0,
                    inclui_sobrancelha: false,
                    descricao: ""
                  });
                  setModalNovoPlano(true);
                }}
                className="bg-amber-500 hover:bg-amber-400 text-black px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition shadow-lg shadow-amber-500/10"
              >
                <Plus className="w-4 h-4" /> Criar Novo Plano
              </button>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {data?.planos?.map((p: any) => (
                <div key={p.id} className="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800/80 flex flex-col justify-between hover:border-zinc-700 transition space-y-4">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-extrabold text-lg text-white">{p.nome}</h3>
                      <div className="text-right">
                        <span className="text-xl font-black text-amber-400">R$ {Number(p.preco_mensal).toFixed(2)}</span>
                        <span className="text-[10px] text-zinc-400 block font-semibold">/mês</span>
                      </div>
                    </div>

                    <p className="text-xs text-zinc-400 mt-2 mb-4">{p.descricao || "Sem descrição"}</p>

                    <ul className="space-y-2 text-xs text-zinc-300">
                      <li className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-amber-400" />
                        <span><strong>{p.cortes_cabelo_inclusos}</strong> Cortes de Cabelo por mês</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-amber-400" />
                        <span><strong>{p.barbas_inclusas}</strong> Barbas por mês</span>
                      </li>
                      <li className="flex items-center gap-2">
                        {p.inclui_sobrancelha ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <X className="w-3.5 h-3.5 text-zinc-600" />
                        )}

                        <span className={p.inclui_sobrancelha ? "text-emerald-400 font-semibold" : "text-zinc-500"}>
                          {p.inclui_sobrancelha ? "Sobrancelha inclusa" : "Sem sobrancelha"}
                        </span>
                      </li>
                    </ul>
                  </div>

                  <div className="border-t border-zinc-800/80 pt-3 flex items-center justify-end gap-2 text-xs">
                    <button 
                      onClick={() => {
                        setFormPlano({
                          id: p.id,
                          nome: p.nome,
                          preco_mensal: p.preco_mensal,
                          cortes_cabelo_inclusos: p.cortes_cabelo_inclusos,
                          barbas_inclusas: p.barbas_inclusas,
                          inclui_sobrancelha: !!p.inclui_sobrancelha,
                          descricao: p.descricao || ""
                        });
                        setModalEditarPlano(p);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold flex items-center gap-1.5 transition"
                    >
                      <Edit className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button 
                      onClick={() => handleExcluirPlano(p.id, p.nome)}
                      className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold flex items-center gap-1.5 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}


        {/* ======================================================== */}
        {/* ABA 3: SERVIÇOS & PREÇOS (GM BARBERSHOP)                 */}
        {/* ======================================================== */}
        {activeTab === "servicos" && (() => {
          const categoriasDisponiveis = [
            { id: "TODAS", label: `Todos (${data?.servicos?.length || 0})` },
            { id: "Cabelo", label: `Cabelo (${data?.servicos?.filter((s: any) => s.categoria === 'Cabelo').length || 0})` },
            { id: "Barba", label: `Barba (${data?.servicos?.filter((s: any) => s.categoria === 'Barba').length || 0})` },
            { id: "Química", label: `Química (${data?.servicos?.filter((s: any) => s.categoria === 'Química').length || 0})` },
            { id: "Combos", label: `Combos (${data?.servicos?.filter((s: any) => s.categoria === 'Combos').length || 0})` },
            { id: "Outros", label: `Outros (${data?.servicos?.filter((s: any) => s.categoria === 'Outros').length || 0})` }
          ];

          const servicosFiltrados = (data?.servicos || []).filter((s: any) => {
            const matchCat = categoriaFiltroServicos === "TODAS" || s.categoria === categoriaFiltroServicos;
            const matchBusca = !buscaServico || s.nome.toLowerCase().includes(buscaServico.toLowerCase()) || (s.descricao && s.descricao.toLowerCase().includes(buscaServico.toLowerCase()));
            return matchCat && matchBusca;
          });

          return (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                    <Scissors className="w-6 h-6 text-amber-400" /> Catálogo de Serviços & Preços
                  </h2>
                  <p className="text-sm text-zinc-400 mt-0.5">
                    {data?.servicos?.length || 0} serviços cadastrados da GM Barbershop. Tudo o que você alterar aqui atualiza no robô do WhatsApp.
                  </p>
                </div>

                <button 
                  onClick={() => {
                    setFormServico({
                      id: "",
                      nome: "",
                      categoria: "Cabelo",
                      preco: "",
                      duracao_minutos: 30,
                      descricao: ""
                    });
                    setModalNovoServico(true);
                  }}
                  className="bg-amber-500 hover:bg-amber-400 text-black px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition shadow-lg shadow-amber-500/10"
                >
                  <Plus className="w-4 h-4" /> Novo Serviço
                </button>
              </div>

              {/* Filtros de Categoria e Busca Rápida */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {categoriasDisponiveis.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCategoriaFiltroServicos(c.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold tracking-wider transition whitespace-nowrap ${
                        categoriaFiltroServicos === c.id
                          ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                          : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                <div className="relative flex-1 max-w-xs">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Buscar serviço por nome..."
                    value={buscaServico}
                    onChange={(e) => setBuscaServico(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition"
                  />
                </div>
              </div>

              {servicosFiltrados.length === 0 ? (
                <div className="py-16 text-center text-zinc-500 text-sm bg-zinc-900/40 rounded-2xl border border-zinc-800/60">
                  Nenhum serviço encontrado com esse filtro ou busca.
                </div>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {servicosFiltrados.map((s: any) => (
                <div key={s.id} className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800/80 flex flex-col justify-between hover:border-zinc-700 transition">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                          {s.categoria}
                        </span>
                        <h4 className="font-bold text-white text-base mt-1.5 leading-snug">{s.nome}</h4>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-white text-base">
                          {s.preco_a_partir_de ? "A partir de " : ""}R$ {Number(s.preco).toFixed(2)}
                        </div>
                        <span className="text-[11px] text-zinc-500 flex items-center gap-1 justify-end mt-0.5">
                          <Clock className="w-3 h-3" /> {s.duracao_minutos} min
                        </span>
                      </div>
                    </div>
                    {s.descricao && (
                      <p className="text-xs text-zinc-400 mt-2 line-clamp-2">{s.descricao}</p>
                    )}

                  </div>

                  <div className="border-t border-zinc-800/60 pt-2.5 mt-3 flex items-center justify-end gap-2 text-xs">
                    <button 
                      onClick={() => {
                        setFormServico({
                          id: s.id,
                          nome: s.nome,
                          categoria: s.categoria,
                          preco: s.preco,
                          duracao_minutos: s.duracao_minutos,
                          descricao: s.descricao || ""
                        });
                        setModalEditarServico(s);
                      }}
                      className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition"
                      title="Editar Serviço"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => handleExcluirServico(s.id, s.nome)}
                      className="p-1 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition"
                      title="Excluir Serviço"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
                </div>
              )}
            </div>
          );
        })()}


        {/* ======================================================== */}
        {/* ABA 4: EQUIPE / BARBEIROS                                */}
        {/* ======================================================== */}
        {activeTab === "usuarios" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                  <Users className="w-6 h-6 text-amber-400" /> Barbeiros & Equipe
                </h2>
                <p className="text-sm text-zinc-400 mt-0.5">
                  Gerencie os barbeiros da casa e seus números de WhatsApp para transbordo automático do robô
                </p>
              </div>

              <button 
                onClick={() => {
                  setFormBarbeiro({
                    id: "",
                    nome: "",
                    telefone_whatsapp: "",
                    email: "",
                    tipo: "BARBEIRO"
                  });
                  setModalNovoBarbeiro(true);
                }}
                className="bg-amber-500 hover:bg-amber-400 text-black px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition shadow-lg shadow-amber-500/10"
              >
                <Plus className="w-4 h-4" /> Adicionar Barbeiro
              </button>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {data?.barbeiros?.map((b: any) => (
                <div key={b.id} className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-extrabold text-lg">
                      {b.nome?.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-base leading-snug">{b.nome}</h4>
                      <div className="text-xs text-emerald-400 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" /> {b.telefone_whatsapp}
                      </div>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                        Cargo: {b.tipo || "BARBEIRO"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => {
                        setFormBarbeiro({
                          id: b.id,
                          nome: b.nome,
                          telefone_whatsapp: b.telefone_whatsapp,
                          email: b.email || "",
                          tipo: b.tipo || "BARBEIRO"
                        });
                        setModalEditarBarbeiro(b);
                      }}
                      className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition"
                      title="Editar Barbeiro"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleExcluirBarbeiro(b.id, b.nome)}
                      className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                      title="Excluir Barbeiro"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}


        {/* ======================================================== */}
        {/* ABA 5: BANCO DE DADOS SQLITE (EXPLORADOR & ACESSO)       */}
        {/* ======================================================== */}
        {activeTab === "banco" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                  <Database className="w-6 h-6 text-amber-400" /> Banco de Dados SQLite
                </h2>
                <p className="text-sm text-zinc-400 mt-0.5">
                  Estrutura 100% local, em arquivo único (.db), sem servidores externos e com velocidade instantânea.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <a 
                  href="/api/banco/download" 
                  download="barbearia.db"
                  className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition"
                >
                  <Download className="w-4 h-4 text-amber-400" /> Baixar Cópia (.db)
                </a>
              </div>
            </div>

            {/* Informações de Localização Física */}
            <div className="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800/80 space-y-3">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Onde o Banco Fica Salvo Fisicamente no Notebook:
              </h3>
              <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 font-mono text-xs text-amber-300 break-all select-all">
                {data?.banco?.caminho || "E:\\ChatBot_MensalistasAPP\\database\\barbearia.db"}
              </div>
              <p className="text-xs text-zinc-400">
                💡 <strong>Como inspecionar fora do sistema:</strong> Você pode abrir esse arquivo direto no seu computador usando o programa <strong>DB Browser for SQLite</strong> ou a extensão SQLite do VS Code. Para fazer backup, basta copiar esse arquivo para onde quiser!
              </p>
            </div>

            {/* Seletor de Tabelas */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Tabelas Disponíveis no Banco:</span>
                <span className="text-xs text-zinc-500">{dadosTabela.rows?.length || 0} registros exibidos</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {["mensalistas", "planos", "servicos", "barbeiros", "historico_cortes", "configuracoes"].map(tbl => (
                  <button
                    key={tbl}
                    onClick={() => carregarTabelaBanco(tbl)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                      tabelaSelecionada === tbl 
                        ? "bg-amber-500 text-black shadow-md shadow-amber-500/20" 
                        : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
                    }`}
                  >
                    <Table className="w-3 h-3" /> {tbl}
                  </button>
                ))}
              </div>

              {/* Tabela de Dados Interativa */}
              <div className="bg-zinc-900/40 rounded-2xl border border-zinc-800/80 overflow-hidden">
                {carregandoTabela ? (
                  <div className="p-12 text-center text-zinc-500 text-sm">Carregando dados da tabela...</div>
                ) : dadosTabela.columns.length === 0 ? (
                  <div className="p-12 text-center text-zinc-500 text-sm">Tabela vazia ou sem dados.</div>
                ) : (
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-950/80 text-zinc-400 font-bold uppercase tracking-wider sticky top-0 border-b border-zinc-800">
                        <tr>
                          {dadosTabela.columns.map(col => (
                            <th key={col} className="p-3 whitespace-nowrap">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50">
                        {dadosTabela.rows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-zinc-800/30 transition">
                            {dadosTabela.columns.map(col => (
                              <td key={col} className="p-3 text-zinc-300 font-mono whitespace-nowrap max-w-xs truncate">
                                {String(row[col] ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

              </div>
            </div>

          </div>
        )}


        {/* ======================================================== */}
        {/* ABA 6: ROBÔ DO WHATSAPP                                  */}
        {/* ======================================================== */}
        {activeTab === "whatsapp" && (
          <div className="space-y-6">
            
            {/* Header da Aba */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                  <MessageSquare className="w-6 h-6 text-emerald-400" /> Robô de Atendimento WhatsApp
                </h2>
                <p className="text-sm text-zinc-400 mt-0.5">
                  Conexão local direta via WhatsApp, com editor de mensagens e sincronização em tempo real.
                </p>
              </div>


            </div>

            {/* Card de Atendimentos Humanos Ativos (Pausa Inteligente) */}
            {atendimentosHumanos.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-3xl p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse"></span>
                    <h3 className="font-extrabold text-sm text-amber-300 flex items-center gap-2">
                      <UserCheck className="w-4 h-4" /> Atendimento Humano Ativo ({atendimentosHumanos.length})
                    </h3>
                  </div>
                  <span className="text-xs text-amber-400/80 font-medium">
                    O robô está em silêncio nestas conversas para não atrapalhar
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {atendimentosHumanos.map((at) => (
                    <div key={at.remote_jid} className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between gap-2 shadow-sm">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-white text-xs flex items-center gap-1.5 truncate">
                          <Phone className="w-3 h-3 text-emerald-400 shrink-0" />
                          <span className="truncate">{at.nome || at.numero || "Cliente"}</span>
                        </div>
                        <p className="text-[11px] text-zinc-400 truncate mt-0.5">{at.motivo}</p>
                        <span className="text-[10px] text-amber-400 font-semibold block mt-0.5">
                          ⏳ Pausa: ~{at.minutos_restantes} min rest.
                        </span>
                      </div>
                      <button
                        onClick={() => reativarRoboConversa(at.remote_jid)}
                        className="px-2.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded-xl text-[11px] font-bold transition flex items-center gap-1 shrink-0"
                        title="Reativar respostas do robô para este cliente imediatamente"
                      >
                        Reativar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SEÇÃO 1: CONEXÃO COM O WHATSAPP (BAILEYS LOCAL) */}
            <div className={`p-6 rounded-3xl border transition shadow-sm ${
              botStatus.status === "CONECTADO" && botStatus.pausado
                ? "bg-amber-950/20 border-amber-500/40"
                : "bg-zinc-900/60 border-zinc-800/80"
            }`}>
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                
                {/* Lado Esquerdo: Status e Instruções */}
                <div className="space-y-3 max-w-xl">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border transition ${
                      botStatus.status === "CONECTADO" && botStatus.pausado
                        ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                        : botStatus.status === "CONECTADO" 
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                        : botStatus.status === "AGUARDANDO_QR"
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse"
                        : "bg-zinc-800 border-zinc-700 text-zinc-400"
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${
                        botStatus.status === "CONECTADO" && botStatus.pausado ? "bg-amber-400 animate-pulse" :
                        botStatus.status === "CONECTADO" ? "bg-emerald-400" :
                        botStatus.status === "AGUARDANDO_QR" ? "bg-amber-400 animate-ping" : "bg-zinc-500"
                      }`}></span>
                      Status: {
                        botStatus.status === "CONECTADO" 
                          ? (botStatus.pausado 
                              ? `Conectado (${botStatus.numero || "Barbearia"}) • PAUSADO TEMPORARIAMENTE` 
                              : `Conectado (${botStatus.numero || "Barbearia"}) • ATIVO 24H`)
                          : botStatus.status === "AGUARDANDO_QR" 
                          ? "Aguardando Leitura do QR Code..." 
                          : "Desconectado (Pronto para Iniciar)"
                      }
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    {botStatus.status === "CONECTADO" ? (
                      botStatus.pausado ? (
                        <>
                          <PauseCircle className="w-5 h-5 text-amber-400 shrink-0" />
                          <span className="text-amber-300">Robô em Pausa Temporária (Conexão Ativa)</span>
                        </>
                      ) : (
                        "O Robô está ativo e atendendo seus clientes no WhatsApp!"
                      )
                    ) : (
                      "Conecte o WhatsApp Oficial da Barbearia"
                    )}
                  </h3>

                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {botStatus.status === "CONECTADO" ? (
                      botStatus.pausado ? (
                        <span className="text-amber-200/90 font-medium block bg-amber-500/10 p-3 rounded-2xl border border-amber-500/20">
                          ⏸️ <strong>Respostas automáticas suspensas:</strong> Seu WhatsApp continua conectado <em>(você não precisa ler o QR Code de novo)</em>, mas o robô não responderá às mensagens dos clientes enquanto estiver em pausa. Perfeito para fazer atualizações ou correções sem o robô interferir.
                        </span>
                      ) : (
                        "Todas as mensagens recebidas são respondidas automaticamente consultando seus serviços, planos e saldo de mensalistas direto do banco SQLite."
                      )
                    ) : (
                      "Abra o WhatsApp no celular da barbearia, vá em Menu ou Configurações > Aparelhos Conectados > Conectar um Aparelho e aponte para o QR Code."
                    )}
                  </p>

                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    {botStatus.status === "DESCONECTADO" && (
                      <button
                        onClick={conectarWhats}
                        disabled={conectandoWhats}
                        className="bg-emerald-500 hover:bg-emerald-400 text-black px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition shadow-lg shadow-emerald-500/20"
                      >
                        <QrCode className="w-4 h-4" />
                        {conectandoWhats ? "Gerando QR Code..." : "Iniciar Robô & Gerar QR Code"}
                      </button>
                    )}

                    {botStatus.status === "CONECTADO" && (
                      <>
                        {/* BOTÃO DE PAUSAR / RETOMAR ROBÔ */}
                        {botStatus.pausado ? (
                          <button
                            onClick={() => alternarPausaRobo(false)}
                            disabled={pausandoBot}
                            className="bg-emerald-500 hover:bg-emerald-400 text-black px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 transition shadow-lg shadow-emerald-500/25 active:scale-95"
                            title="Reativar envio automático de respostas aos clientes no WhatsApp"
                          >
                            <Play className="w-4 h-4 fill-current" />
                            {pausandoBot ? "Retomando..." : "Retomar Robô (Reativar Respostas)"}
                          </button>
                        ) : (
                          <button
                            onClick={() => alternarPausaRobo(true)}
                            disabled={pausandoBot}
                            className="bg-amber-500 hover:bg-amber-400 text-black px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 transition shadow-lg shadow-amber-500/25 active:scale-95"
                            title="Pausar temporariamente as respostas do robô aos clientes sem desconectar do WhatsApp"
                          >
                            <Pause className="w-4 h-4 stroke-[3]" />
                            {pausandoBot ? "Pausando..." : "Pausar Robô"}
                          </button>
                        )}

                        <button
                          onClick={desconectarWhats}
                          className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition"
                          title="Desconectar permanentemente o WhatsApp (precisará ler o QR Code de novo)"
                        >
                          <X className="w-3.5 h-3.5" /> Desconectar Sessão
                        </button>
                      </>
                    )}

                    {botStatus.status === "AGUARDANDO_QR" && (
                      <button
                        onClick={conectarWhats}
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                      >
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Atualizar QR Code
                      </button>
                    )}

                  </div>
                </div>

                {/* Lado Direito: Exibição do QR Code / Status */}
                <div className="w-56 h-56 bg-white p-3 rounded-2xl border-4 border-zinc-800 shadow-2xl flex flex-col items-center justify-center flex-shrink-0">
                  {botStatus.status === "CONECTADO" ? (
                    botStatus.pausado ? (
                      <div className="text-center text-amber-600 p-2">
                        <PauseCircle className="w-16 h-16 mx-auto mb-2 text-amber-500 animate-pulse" />
                        <div className="font-extrabold text-sm text-zinc-900">WhatsApp Conectado</div>
                        <div className="text-[11px] font-bold text-amber-800 mt-1 bg-amber-100 py-0.5 px-2.5 rounded-full inline-block">
                          Respostas em Pausa
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-emerald-600 p-2">
                        <CheckCircle2 className="w-16 h-16 mx-auto mb-2 text-emerald-500 animate-bounce" />
                        <div className="font-extrabold text-sm text-zinc-900">WhatsApp Conectado!</div>
                        <div className="text-[10px] text-zinc-500 mt-1">Pronto para responder 24h</div>
                      </div>
                    )
                  ) : botStatus.qr ? (
                    <img 
                      src={botStatus.qr} 
                      alt="QR Code WhatsApp" 
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-center text-zinc-400 p-2">
                      <QrCode className="w-16 h-16 mx-auto mb-2 text-zinc-800" />
                      <span className="text-xs font-bold text-zinc-700 block">QR Code Desligado</span>
                      <span className="text-[10px] text-zinc-500">Clique em "Iniciar Robô"</span>
                    </div>
                  )}

                </div>

              </div>
            </div>

            {/* SEÇÃO 2: EDITOR VISUAL DE MENSAGENS COM SINCRONIZAÇÃO SQLITE */}
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900/60 p-5 rounded-3xl border border-zinc-800/80">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Edit className="w-5 h-5 text-amber-400" /> Configuração & Editor de Conversas Pré-Treinadas
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Respostas oficiais configuradas na ordem exata do menu de WhatsApp. Edite qualquer mensagem ou crie novas conversas personalizadas.
                  </p>
                </div>

                {/* BOTÕES DE AÇÃO EM DESTAQUE NO TOPO */}
                <div className="flex items-center gap-2.5 flex-wrap">
                  <button
                    onClick={() => setModalNovaConversa(true)}
                    className="bg-amber-500 hover:bg-amber-400 text-black px-4 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition"
                  >
                    <Plus className="w-4 h-4 stroke-[3]" /> + Adicionar Mais Conversas
                  </button>

                  <button
                    onClick={restaurarPadraoMensagens}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-3.5 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-1.5 border border-zinc-700/60 transition"
                    title="Restaurar sequência padrão oficial do menu da GM"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Restaurar Ordem do Menu
                  </button>
                </div>
              </div>

              {/* Filtro por Categorias Organizadas */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {[
                  { id: "TODAS", label: `Todas as Mensagens (${mensagensBot.length})` },
                  { id: "MENU", label: "Opções do Menu Principal (1 a 4)" },
                  { id: "AUTOMACAO", label: "Avisos & Respostas Automáticas" },
                  { id: "CUSTOM", label: "Conversas Personalizadas" }
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setCategoriaFiltroBot(f.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold tracking-wider transition ${
                      categoriaFiltroBot === f.id
                        ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                        : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="grid lg:grid-cols-12 gap-6 items-start">
                
                {/* Coluna 1: Lista de Mensagens do Fluxo (4 colunas) */}
                <div className="lg:col-span-4 bg-zinc-900/60 p-4 rounded-3xl border border-zinc-800/80 space-y-2 max-h-[680px] overflow-y-auto">
                  <div className="flex items-center justify-between px-1 mb-2">
                    <div>
                      <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider block">Fluxos Cadastrados:</span>
                      <span className="text-[10px] text-amber-400 font-mono">
                        {mensagensBot.filter((m: any) => {
                          if (categoriaFiltroBot === "TODAS") return true;
                          if (categoriaFiltroBot === "MENU") return m.categoria === "MENU" || m.categoria === "ATENDIMENTO" || m.categoria === "AGENDAMENTO";
                          if (categoriaFiltroBot === "AUTOMACAO") return m.categoria === "AUTOMACAO" || m.categoria === "SERVICOS" || m.categoria === "INFORMACOES" || m.categoria === "EQUIPE" || m.categoria === "MENSALISTA";
                          if (categoriaFiltroBot === "CUSTOM") return m.id.startsWith("msg_custom_") || m.categoria === "PERSONALIZADA";
                          return true;
                        }).length} conversas exibidas
                      </span>
                    </div>

                    <button
                      onClick={() => setModalNovaConversa(true)}
                      className="bg-amber-500 hover:bg-amber-400 text-black px-2.5 py-1 rounded-xl font-bold text-[11px] flex items-center gap-1 transition shadow-sm active:scale-95"
                      title="Adicionar mais uma conversa de atendimento"
                    >
                      <Plus className="w-3 h-3" /> Nova Conversa
                    </button>
                  </div>

                  {mensagensBot
                    .filter((m: any) => {
                      if (categoriaFiltroBot === "TODAS") return true;
                      if (categoriaFiltroBot === "MENU") return m.categoria === "MENU";
                      if (categoriaFiltroBot === "AUTOMACAO") return m.categoria === "AUTOMACAO" || m.categoria === "ATENDIMENTO" || m.categoria === "MENSALISTA" || m.categoria === "SERVICOS" || m.categoria === "INFORMACOES" || m.categoria === "EQUIPE";
                      if (categoriaFiltroBot === "CUSTOM") return m.id.startsWith("msg_custom_") || m.categoria === "PERSONALIZADA";
                      return true;
                    })
                    .map((m: any, idx: number) => (
                    <div
                      key={m.id}
                      onClick={() => {
                        setMensagemSelecionadaId(m.id);
                        setTextoEditando(m.mensagem);
                        setGatilhoEditando(m.gatilho || "");
                      }}
                      className={`w-full text-left p-3 rounded-2xl transition border cursor-pointer relative ${
                        mensagemSelecionadaId === m.id
                          ? "bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-sm"
                          : "bg-zinc-950/60 border-zinc-800/60 text-zinc-400 hover:text-white hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            #{String(m.ordem ?? idx + 1).padStart(2, "0")}
                          </span>
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                            m.categoria === "MENU" || m.categoria === "ATENDIMENTO" || m.categoria === "AGENDAMENTO"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                              : m.id.startsWith("msg_custom_")
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                              : "bg-blue-500/10 text-blue-400 border-blue-500/30"
                          }`}>
                            {m.categoria === "MENU" || m.categoria === "ATENDIMENTO" || m.categoria === "AGENDAMENTO"
                              ? "MENU"
                              : m.id.startsWith("msg_custom_")
                              ? "PERSONALIZADA"
                              : "AUTOMÁTICA"}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {m.id.startsWith("msg_custom_") && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExcluirConversa(m.id, m.titulo);
                              }}
                              className="p-1 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition"
                              title="Excluir conversa personalizada"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {mensagemSelecionadaId === m.id && (
                            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                          )}

                        </div>
                      </div>

                      <div className="font-bold text-xs text-white leading-tight flex items-center justify-between">
                        <span className="truncate">{m.titulo}</span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-60 flex-shrink-0 ml-1" />
                      </div>

                      <p className="text-[11px] text-zinc-500 mt-1 line-clamp-1">{m.descricao}</p>
                      
                      {m.gatilho && (
                        <div className="mt-1 text-[9px] text-amber-400/80 font-mono truncate">
                          Gatilho: {m.gatilho}
                        </div>
                      )}

                    </div>
                  ))}
                </div>

                {/* Coluna 2: Editor de Texto da Mensagem (4 colunas) */}
                <div className="lg:col-span-4 bg-zinc-900/60 p-5 rounded-3xl border border-zinc-800/80 space-y-4">
                  {(() => {
                    const sel = mensagensBot.find((m: any) => m.id === mensagemSelecionadaId);
                    if (!sel) return <div className="text-xs text-zinc-500">Selecione uma mensagem na lista ao lado.</div>;

                    const variaveis = sel.variaveis_disponiveis ? sel.variaveis_disponiveis.split(",") : [];

                    // Lista de variáveis globais frequentes
                    const variaveisGlobais = [
                      "{cliente}",
                      "{lista_planos}",
                      "{lista_servicos}",
                      "{servicos_barba}",
                      "{servicos_quimica}",
                      "{lista_barbeiros}",
                      "{link_booksy}",
                      "{cortes}",
                      "{barbas}",
                      "{pix}",
                      "{barbearia}",
                      "{endereco}",
                      "{maps}",
                      "{horario}",
                      "{plano}",
                      "{vencimento}",
                      "{sobrancelhas}"
                    ];

                    return (
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2 border-b border-zinc-800 pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                {sel.categoria}
                              </span>
                              <h4 className="font-bold text-sm text-white">{sel.titulo}</h4>
                            </div>
                            <p className="text-[11px] text-zinc-400 mt-1">{sel.descricao}</p>
                          </div>
                        </div>

                        {/* Variáveis Dinâmicas Clicáveis (Inserção Direta no Cursor) */}
                        <div className="space-y-1.5 bg-zinc-950/60 p-3 rounded-2xl border border-zinc-800/60">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                              Variáveis Dinâmicas (Clique para Inserir):
                            </span>
                            <span className="text-[9px] text-zinc-500">Inserido na posição do cursor</span>
                          </div>
                          
                          <div className="flex flex-wrap gap-1.5">
                            {/* Tags recomendadas do fluxo */}
                            {variaveis.map((v: string) => {
                              const tag = v.trim();
                              return (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => inserirVariavelMensagem(tag)}
                                  className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 hover:border-amber-400 text-[10px] font-mono text-amber-300 font-bold transition flex items-center gap-1 active:scale-95"
                                  title={`Inserir ${tag} no texto`}
                                >
                                  + {tag}
                                </button>
                              );
                            })}

                            {/* Tags adicionais úteis */}
                            {variaveisGlobais
                              .filter(g => !variaveis.map(v => v.trim()).includes(g))
                              .slice(0, 6)
                              .map((tag) => (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => inserirVariavelMensagem(tag)}
                                  className="px-2 py-0.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 transition active:scale-95"
                                  title={`Inserir ${tag}`}
                                >
                                  + {tag}
                                </button>
                              ))}
                          </div>
                        </div>

                        {/* Atalhos Rápidos de Formatação WhatsApp */}
                        <div className="flex items-center gap-2 text-[10px] text-zinc-400 px-1">
                          <span className="font-semibold text-zinc-500">Formatação WhatsApp:</span>
                          <button
                            type="button"
                            onClick={() => inserirVariavelMensagem("*negrito*")}
                            className="hover:text-amber-400 underline"
                          >
                            *negrito*
                          </button>
                          <span>•</span>
                          <button
                            type="button"
                            onClick={() => inserirVariavelMensagem("_itálico_")}
                            className="hover:text-amber-400 italic"
                          >
                            _itálico_
                          </button>
                          <span>•</span>
                          <button
                            type="button"
                            onClick={() => inserirVariavelMensagem("~tachado~")}
                            className="hover:text-amber-400 line-through"
                          >
                            ~tachado~
                          </button>
                        </div>

                        {/* Campo de Edição do Texto com Ref */}
                        <div>
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                            Mensagem Sincronizada no Banco de Dados:
                          </label>
                          <textarea
                            ref={textareaMensagemRef}
                            rows={10}
                            value={textoEditando}
                            onChange={(e) => setTextoEditando(e.target.value)}
                            placeholder="Digite o texto da mensagem..."
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-3.5 text-xs text-zinc-100 font-mono focus:border-amber-500 focus:outline-none leading-relaxed transition shadow-inner"
                          />
                        </div>

                        {/* Campo de Palavras-Chave / Gatilhos */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                            Palavras-Chave de Ativação no WhatsApp (Gatilhos):
                          </label>
                          <input
                            type="text"
                            value={gatilhoEditando}
                            onChange={(e) => setGatilhoEditando(e.target.value)}
                            placeholder="ex: agendar, horario, vaga, 1"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 font-mono focus:border-amber-500 focus:outline-none"
                          />
                          <span className="text-[9px] text-zinc-500 block">
                            💡 Separe por vírgulas. Quando o cliente enviar essas palavras, o robô responderá com esta mensagem.
                          </span>
                        </div>

                        {/* Botão de Salvar no SQLite */}
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={salvarMensagemBot}
                            disabled={salvandoMensagem}
                            className="w-full bg-amber-500 hover:bg-amber-400 text-black py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-amber-500/10 active:scale-95"
                          >
                            <Check className="w-4 h-4" />
                            {salvandoMensagem ? "Gravando no SQLite..." : "Salvar Mensagem no Banco SQLite"}
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Coluna 3: Simulador Visual de Chat WhatsApp (Device Preview) (4 colunas) */}
                <div className="lg:col-span-4 bg-zinc-900/60 p-4 rounded-3xl border border-zinc-800/80 space-y-3">
                  <div className="flex items-center justify-between px-2">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                      Simulação ao Vivo no WhatsApp:
                    </span>
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      Preview Real
                    </span>
                  </div>

                  {/* Mockup do Smartphone WhatsApp */}
                  <div className="bg-zinc-950 rounded-2xl border-2 border-zinc-800 overflow-hidden shadow-2xl flex flex-col h-[520px]">
                    
                    {/* Header do WhatsApp */}
                    <div className="bg-[#1f2c34] p-3 flex items-center gap-3 border-b border-zinc-800 flex-shrink-0">
                      <div className="w-9 h-9 rounded-full bg-amber-500 flex items-center justify-center text-black font-extrabold text-xs shadow">
                        GM
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-xs text-white leading-tight truncate">
                          {data?.config?.nome_barbearia || "GM Barbershop"}
                        </div>
                        <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> online agora
                        </div>
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono">
                        Robô 24h
                      </div>
                    </div>

                    {/* Área de Mensagens (Fundo Chat WhatsApp) */}
                    <div className="flex-1 p-3.5 bg-[#0b141a] overflow-y-auto space-y-3 font-sans">
                      
                      {/* Balão do Cliente */}
                      <div className="flex justify-end">
                        <div className="bg-[#005c4b] text-white p-2.5 rounded-2xl rounded-tr-none text-xs max-w-[85%] shadow">
                          <span>Olá, gostaria de informações!</span>
                          <span className="text-[9px] text-emerald-200/70 block text-right mt-1">14:30 ✓✓</span>
                        </div>
                      </div>

                      {/* Balão de Resposta do Robô (Prévia Dinâmica com Substituição Real e Markdown) */}
                      <div className="flex justify-start">
                        <div className="bg-[#202c33] text-zinc-100 p-3 rounded-2xl rounded-tl-none text-xs max-w-[92%] shadow space-y-1.5 border border-zinc-700/40">
                          
                          {/* Renderização com substituição visual das variáveis e WhatsApp Markdown */}
                          <div 
                            className="whitespace-pre-wrap leading-relaxed text-[11px]"
                            dangerouslySetInnerHTML={{
                              __html: textoEditando
                                ? formatarWhatsAppParaHtml(
                                    (
                                      textoEditando + 
                                      (mensagemSelecionadaId !== "msg_boas_vindas" && mensagemSelecionadaId !== "msg_alerta_barbeiro" && !textoEditando.includes("voltar ao menu") && !textoEditando.includes("basta dizer oi")
                                        ? "\n\n_💡 Se quiser voltar ao menu, basta dizer *oi* novamente que te trago o menu!_" 
                                        : "")
                                    )
                                      .replace(/{cliente}/g, "Lucas Silva")
                                      .replace(/{barbearia}/g, data?.config?.nome_barbearia || "GM Barbershop")
                                      .replace(/{link_booksy}/g, data?.config?.link_booksy || "https://booksy.com/gm")
                                      .replace(/{lista_planos}/g, "🏆 *Plano Corte Semanal GM:* R$ 130,00/mês\n• 4 cortes de cabelo no mês (1 por semana)\n• 10% de desconto em pomadas e produtos")
                                      .replace(/{plano}/g, "Corte Semanal GM")
                                      .replace(/{cortes}/g, "3")
                                      .replace(/{barbas}/g, "2")
                                      .replace(/{sobrancelhas}/g, "1")
                                      .replace(/{vencimento}/g, "05/12/2026")
                                      .replace(/{pix}/g, data?.config?.chave_pix || "11960129564")
                                      .replace(/{endereco}/g, data?.config?.endereco || "Rua Exemplo da GM, 100 - São Paulo/SP")
                                      .replace(/{maps}/g, data?.config?.link_google_maps || "https://maps.google.com")
                                      .replace(/{horario}/g, data?.config?.horario_funcionamento || "Terça a Sábado das 09h às 20h")
                                      .replace(/{lista_servicos}/g, "• Corte - R$ 40,00\n• Barba - R$ 30,00\n• Corte e Barba - R$ 70,00\n• Luzes - R$ 70,00\n• Platinado - R$ 160,00")
                                      .replace(/{lista_barbeiros}/g, "1️⃣ - Gabriel (Proprietário)\n2️⃣ - Erick")
                                      .replace(/{nome_barbeiro}/g, "Gabriel")
                                      .replace(/{telefone_cliente}/g, "(11) 98888-1111")
                                  )
                                : '<span class="text-zinc-500 italic">Selecione uma mensagem para visualizar a prévia...</span>'
                            }}
                          />

                          <div className="text-[9px] text-zinc-400 text-right pt-0.5">
                            14:30
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* Barra de Envio Falsa */}
                    <div className="bg-[#1f2c34] p-2 flex items-center gap-2 border-t border-zinc-800 flex-shrink-0 text-zinc-400 text-xs">
                      <div className="flex-1 bg-[#2a3942] rounded-full px-3 py-1.5 text-[11px] text-zinc-400">
                        Mensagem
                      </div>
                      <div className="w-7 h-7 rounded-full bg-emerald-500 text-black flex items-center justify-center font-bold text-xs shadow">
                        ➤
                      </div>
                    </div>

                  </div>
                </div>

              </div>
            </div>

          </div>
        )}


        {/* ======================================================== */}
        {/* ABA: GERENCIADOR DE CONVERSAS & ATENDIMENTO (IA vs HUMANO) */}
        {/* ======================================================== */}
        {activeTab === "conversas" && (
          <div className="space-y-6 animate-fade-in">
            {/* Cabeçalho */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
              <div>
                <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                  <MessageCircle className="w-6 h-6 text-amber-400" />
                  Painel de Conversas & Atendimento
                </h2>
                <p className="text-sm text-zinc-400 mt-0.5">
                  Acompanhe em tempo real quem está com a <strong className="text-amber-300">Elaine.IA</strong> e quem está com o <strong className="text-amber-300">Atendimento Humano do Barbeiro</strong>.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => carregarConversas(true)}
                  disabled={carregandoConversas}
                  className="px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-sm"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${carregandoConversas ? "animate-spin" : ""}`} />
                  {carregandoConversas ? "Atualizando..." : "Atualizar Conversas"}
                </button>
              </div>
            </div>

            {/* Banner de Aviso de Conexão do WhatsApp */}
            {botStatus.status !== "CONECTADO" ? (
              <div className="p-4 bg-amber-500/15 border border-amber-500/40 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-amber-200 shadow-lg shadow-amber-500/5">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                  <div className="text-xs">
                    <strong className="text-white block font-bold">
                      {botStatus.status === "AGUARDANDO_QR"
                        ? "O WhatsApp está aguardando leitura do QR Code"
                        : "O Robô do WhatsApp está desconectado no momento"}
                    </strong>
                    <span>
                      {botStatus.status === "AGUARDANDO_QR"
                        ? "Abra a aba Robô do WhatsApp para apontar a câmera do celular e escanear o QR Code."
                        : "O processo do robô não está ativo em memória. Clique no botão ao lado para conectar."}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("whatsapp")}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-xs font-black rounded-xl transition whitespace-nowrap shadow-md shadow-amber-500/20"
                >
                  {botStatus.status === "AGUARDANDO_QR" ? "Escanear QR Code Agora" : "Conectar WhatsApp"}
                </button>
              </div>
            ) : botStatus.pausado ? (
              <div className="p-4 bg-amber-950/30 border border-amber-500/40 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-amber-200 shadow-lg shadow-amber-500/5">
                <div className="flex items-center gap-3">
                  <PauseCircle className="w-5 h-5 text-amber-400 shrink-0" />
                  <div className="text-xs">
                    <strong className="text-white block font-bold">
                      O Robô do WhatsApp está em Pausa Global Temporária.
                    </strong>
                    <span>A conexão está ativa, mas todas as respostas automáticas estão suspensas até serem retomadas.</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => alternarPausaRobo(false)}
                  disabled={pausandoBot}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black rounded-xl transition whitespace-nowrap shadow-md shadow-emerald-500/20"
                >
                  {pausandoBot ? "Retomando..." : "Retomar Robô Agora"}
                </button>
              </div>
            ) : null}

            {/* Cards de Métricas e Status Rápido */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-zinc-900/70 border border-zinc-800/80 p-4 rounded-2xl flex items-center justify-between shadow-sm">
                <div>
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Total de Conversas</span>
                  <span className="text-2xl font-black text-white mt-1 block">{conversas.length}</span>
                  <span className="text-[11px] text-zinc-500">Histórico no WhatsApp</span>
                </div>
                <div className="p-3 bg-zinc-800/80 border border-zinc-700/60 rounded-xl text-zinc-300">
                  <MessageCircle className="w-5 h-5 text-amber-400" />
                </div>
              </div>

              <div className="bg-zinc-900/70 border border-emerald-500/30 p-4 rounded-2xl flex items-center justify-between shadow-lg shadow-emerald-500/5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">Com a Elaine.IA</span>
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold px-1.5 py-0.2 rounded-full">
                      AUTOMÁTICO
                    </span>
                  </div>
                  <span className="text-2xl font-black text-white mt-1 block">
                    {conversas.filter(c => c.status === "IA").length}
                  </span>
                  <span className="text-[11px] text-zinc-400">Respondendo clientes</span>
                </div>
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
                  <Sparkles className="w-5 h-5" />
                </div>
              </div>

              <div className={`border p-4 rounded-2xl flex items-center justify-between transition ${
                conversas.filter(c => c.status === "HUMANO").length > 0
                  ? "bg-amber-950/30 border-amber-500/50 shadow-lg shadow-amber-500/10"
                  : "bg-zinc-900/70 border-zinc-800/80"
              }`}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">Atendimento Humano</span>
                    {conversas.filter(c => c.status === "HUMANO").length > 0 && (
                      <span className="text-[9px] bg-amber-500 text-black font-extrabold px-1.5 py-0.2 rounded-full animate-pulse">
                        PAUSADO
                      </span>
                    )}
                  </div>
                  <span className="text-2xl font-black text-white mt-1 block">
                    {conversas.filter(c => c.status === "HUMANO").length}
                  </span>
                  <span className="text-[11px] text-zinc-400">Barbeiro no comando</span>
                </div>
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
                  <Headphones className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Barra de Filtro e Busca */}
            <div className="bg-zinc-900/60 p-3.5 rounded-2xl border border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Botões de Filtro */}
              <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto pb-1 sm:pb-0">
                <span className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-1.5 px-2">
                  <Filter className="w-3.5 h-3.5" />
                  Filtrar:
                </span>
                <button
                  type="button"
                  onClick={() => setFiltroStatusConversa("TODAS")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                    filtroStatusConversa === "TODAS"
                      ? "bg-amber-500 text-black shadow-md shadow-amber-500/20"
                      : "bg-zinc-800/70 text-zinc-400 hover:text-white hover:bg-zinc-800"
                  }`}
                >
                  Todas ({conversas.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroStatusConversa("IA")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                    filtroStatusConversa === "IA"
                      ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/20"
                      : "bg-zinc-800/70 text-zinc-400 hover:text-white hover:bg-zinc-800"
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  Elaine.IA ({conversas.filter(c => c.status === "IA").length})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroStatusConversa("HUMANO")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                    filtroStatusConversa === "HUMANO"
                      ? "bg-amber-500 text-black shadow-md shadow-amber-500/20 font-extrabold"
                      : "bg-zinc-800/70 text-zinc-400 hover:text-white hover:bg-zinc-800"
                  }`}
                >
                  <Headphones className="w-3 h-3" />
                  Humano ({conversas.filter(c => c.status === "HUMANO").length})
                </button>
              </div>

              {/* Campo de Busca */}
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Buscar por nome ou telefone..."
                  value={buscaConversa}
                  onChange={(e) => setBuscaConversa(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 font-medium"
                />
                {buscaConversa && (
                  <button
                    type="button"
                    onClick={() => setBuscaConversa("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Lista de Conversas */}
            <div className="space-y-3">
              {(() => {
                const conversasFiltradas = conversas.filter(c => {
                  const matchStatus = filtroStatusConversa === "TODAS" || c.status === filtroStatusConversa;
                  const matchBusca = !buscaConversa || 
                    (c.nome && c.nome.toLowerCase().includes(buscaConversa.toLowerCase())) || 
                    (c.numero && c.numero.includes(buscaConversa)) ||
                    (c.ultima_mensagem && c.ultima_mensagem.toLowerCase().includes(buscaConversa.toLowerCase()));
                  return matchStatus && matchBusca;
                });

                if (conversasFiltradas.length === 0) {
                  return (
                    <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-3xl p-12 text-center space-y-3">
                      <div className="w-14 h-14 mx-auto rounded-2xl bg-zinc-800/70 border border-zinc-700/60 flex items-center justify-center text-zinc-400">
                        <MessageCircle className="w-7 h-7 text-amber-400" />
                      </div>
                      <h3 className="text-base font-bold text-white">Nenhuma conversa encontrada</h3>
                      <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                        {buscaConversa 
                          ? `Nenhum resultado para "${buscaConversa}". Experimente limpar o filtro de busca.`
                          : filtroStatusConversa === "HUMANO"
                            ? "Nenhum atendimento humano pausado no momento. A Elaine.IA está cuidando de todas as conversas automaticamente!"
                            : "As conversas do WhatsApp aparecerão aqui em tempo real assim que os clientes entrarem em contato."}
                      </p>
                      {buscaConversa && (
                        <button
                          type="button"
                          onClick={() => setBuscaConversa("")}
                          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-xl transition"
                        >
                          Limpar Busca
                        </button>
                      )}
                    </div>
                  );
                }

                return conversasFiltradas.map((conv) => {
                  const ehHumano = conv.status === "HUMANO";
                  const telefoneLimpo = conv.numero?.replace(/[^0-9]/g, "") || "";
                  const linkWhatsappWeb = `https://web.whatsapp.com/send?phone=${telefoneLimpo}`;
                  const dataFormatada = conv.atualizado_em ? new Date(conv.atualizado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
                  const dataDiaFormatada = conv.atualizado_em ? new Date(conv.atualizado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";

                  return (
                    <div 
                      key={conv.remote_jid}
                      className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                        ehHumano
                          ? "bg-gradient-to-r from-amber-950/20 via-zinc-900/80 to-zinc-900/60 border-amber-500/40 shadow-lg shadow-amber-500/5"
                          : "bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        {/* Informações do Contato e Status */}
                        <div className="flex items-start gap-3.5 flex-1 min-w-0">
                          {/* Avatar */}
                          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm flex-shrink-0 border ${
                            ehHumano
                              ? "bg-amber-500 text-black border-amber-400 font-black shadow-md shadow-amber-500/20"
                              : "bg-zinc-800 text-zinc-200 border-zinc-700"
                          }`}>
                            {conv.nome ? conv.nome.charAt(0).toUpperCase() : "C"}
                          </div>

                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-bold text-sm text-white truncate">
                                {conv.nome || "Cliente do WhatsApp"}
                              </h4>
                              
                              <span className="text-xs font-mono text-zinc-400">
                                {formatarTelefoneBR(conv.numero)}
                              </span>

                              {/* Badge de Status Atual */}
                              {ehHumano ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-black uppercase tracking-wider animate-pulse">
                                  <Headphones className="w-3 h-3" />
                                  Atendimento Humano
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
                                  <Sparkles className="w-3 h-3 text-emerald-400" />
                                  Elaine.IA Ativa
                                </span>
                              )}

                              {dataFormatada && (
                                <span className="text-[11px] text-zinc-500 ml-auto">
                                  {dataDiaFormatada} às {dataFormatada}
                                </span>
                              )}
                            </div>

                            {/* Detalhes de Pausa se Humano */}
                            {ehHumano && (
                              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                <span className="text-[11px] text-amber-300/90 font-medium bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-amber-400" />
                                  {conv.minutos_restantes > 0 
                                    ? `Robô pausado (~${conv.minutos_restantes} min restantes)` 
                                    : "Robô pausado para atendimento do barbeiro"}
                                </span>
                                {conv.motivo_pausa && (
                                  <span className="text-[11px] text-zinc-400 italic">
                                    • {conv.motivo_pausa}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Snippet da Última Mensagem */}
                            {conv.ultima_mensagem && (
                              <div className="pt-1.5">
                                <div className="text-xs text-zinc-300 bg-zinc-950/70 border border-zinc-800/80 rounded-xl px-3 py-2 flex items-start gap-2">
                                  <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                                    conv.ultimo_remetente === "IA"
                                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                      : conv.ultimo_remetente === "HUMANO"
                                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                        : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                  }`}>
                                    {conv.ultimo_remetente === "IA" ? "Elaine.IA" : conv.ultimo_remetente === "HUMANO" ? "Barbeiro" : "Cliente"}
                                  </span>
                                  <p className="line-clamp-2 leading-relaxed text-zinc-300">
                                    {conv.ultima_mensagem}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Botões de Ação na Conversa */}
                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 lg:flex-shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-zinc-800/80">
                          {ehHumano ? (
                            <button
                              type="button"
                              disabled={acaoConversaLoading === conv.remote_jid}
                              onClick={() => alternarAtendimentoConversa(conv.remote_jid, "IA", conv.nome, conv.numero)}
                              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20 transition disabled:opacity-50 whitespace-nowrap"
                              title="Reativa a Elaine.IA para responder este cliente automaticamente"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-black" />
                              {acaoConversaLoading === conv.remote_jid ? "Devolvendo..." : "Passar para a Elaine.IA"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={acaoConversaLoading === conv.remote_jid}
                              onClick={() => alternarAtendimentoConversa(conv.remote_jid, "HUMANO", conv.nome, conv.numero)}
                              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20 transition disabled:opacity-50 whitespace-nowrap"
                              title="Pausa o robô nesta conversa para o barbeiro falar sem ser interrompido"
                            >
                              <Headphones className="w-3.5 h-3.5 text-black" />
                              {acaoConversaLoading === conv.remote_jid ? "Assumindo..." : "Assumir Atendimento"}
                            </button>
                          )}

                          <a
                            href={linkWhatsappWeb}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition whitespace-nowrap"
                            title="Abrir no WhatsApp Web"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
                            Abrir WhatsApp
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* ABA 7: CONFIGURAÇÕES DA BARBEARIA (REPAGINADA & ORGANIZADA) */}
        {/* ======================================================== */}
        {activeTab === "config" && (
          <div className="space-y-6 animate-fade-in w-full">
            {/* Cabeçalho */}
            <div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
                <Settings className="w-6 h-6 text-amber-400" /> Configurações do Sistema & Barbearia
              </h2>
              <p className="text-sm text-zinc-400 mt-0.5">
                Gerencie todos os dados da barbearia, inteligência artificial, regras de atendimento e segurança.
              </p>
            </div>

            {/* Barra de Sub-abas de Navegação das Categorias */}
            <div className="flex flex-wrap items-center gap-2 pb-2.5 border-b border-zinc-800/80">
              <button
                type="button"
                onClick={() => setSubTabConfig("todas")}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
                  subTabConfig === "todas"
                    ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-black"
                    : "bg-zinc-900/80 text-zinc-400 hover:text-white hover:bg-zinc-800"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Todas as Opções
              </button>

              <button
                type="button"
                onClick={() => setSubTabConfig("perfil")}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
                  subTabConfig === "perfil"
                    ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-black"
                    : "bg-zinc-900/80 text-zinc-400 hover:text-white hover:bg-zinc-800"
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                Perfil & Booksy
              </button>

              <button
                type="button"
                onClick={() => setSubTabConfig("ia")}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
                  subTabConfig === "ia"
                    ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-black"
                    : "bg-zinc-900/80 text-amber-400 hover:text-white hover:bg-zinc-800 border border-amber-500/20"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Elaine.IA
              </button>

              <button
                type="button"
                onClick={() => setSubTabConfig("localizacao")}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
                  subTabConfig === "localizacao"
                    ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-black"
                    : "bg-zinc-900/80 text-zinc-400 hover:text-white hover:bg-zinc-800"
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                Endereço & GPS
              </button>

              <button
                type="button"
                onClick={() => setSubTabConfig("horarios")}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
                  subTabConfig === "horarios"
                    ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-black"
                    : "bg-zinc-900/80 text-zinc-400 hover:text-white hover:bg-zinc-800"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                Horários & Pix
              </button>

              <button
                type="button"
                onClick={() => setSubTabConfig("automacoes")}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
                  subTabConfig === "automacoes"
                    ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-black"
                    : "bg-zinc-900/80 text-zinc-400 hover:text-white hover:bg-zinc-800"
                }`}
              >
                <Bell className="w-3.5 h-3.5" />
                Pausa & Automações
              </button>

              <button
                type="button"
                onClick={() => setSubTabConfig("seguranca")}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
                  subTabConfig === "seguranca"
                    ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-black"
                    : "bg-zinc-900/80 text-zinc-400 hover:text-white hover:bg-zinc-800"
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                Segurança
              </button>

              <button
                type="button"
                onClick={() => setSubTabConfig("atualizacoes")}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap ${
                  subTabConfig === "atualizacoes"
                    ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-black"
                    : "bg-zinc-900/80 text-zinc-400 hover:text-white hover:bg-zinc-800"
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Atualizações
                {statusAtualizacao?.temAtualizacao && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                )}
              </button>
            </div>

            <form onSubmit={handleSalvarConfig} className="space-y-6">
              
              {/* CARD 1: PERFIL OFICIAL & BOOKSY */}
              {(subTabConfig === "todas" || subTabConfig === "perfil") && (
                <div className="bg-zinc-900/60 p-6 rounded-3xl border border-zinc-800/80 space-y-4 shadow-sm">
                  <div className="flex items-center gap-3 pb-2 border-b border-zinc-800/80">
                    <div className="p-2.5 bg-amber-500/10 rounded-2xl border border-amber-500/20 text-amber-400">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base text-white">Perfil Oficial da Barbearia</h3>
                      <p className="text-xs text-zinc-400">Informações públicas exibidas no painel e utilizadas pelo robô</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
                    <div>
                      <label className="text-xs font-bold text-zinc-400 uppercase">Nome da Barbearia</label>
                      <input 
                        type="text" 
                        value={data?.config?.nome_barbearia || ""}
                        onChange={(e) => setData({ ...data, config: { ...data.config, nome_barbearia: e.target.value } })}
                        placeholder="Ex: GM Barbershop"
                        className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-medium"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-zinc-400 uppercase">Telefone Principal (WhatsApp)</label>
                      <input 
                        type="text" 
                        maxLength={15}
                        value={data?.config?.telefone_principal || ""}
                        onChange={(e) => setData({ ...data, config: { ...data.config, telefone_principal: formatarTelefoneBR(e.target.value) } })}
                        placeholder="(11) 96012-9564"
                        className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-medium font-mono"
                      />
                    </div>

                    <div className="md:col-span-2 lg:col-span-1">
                      <label className="text-xs font-bold text-zinc-400 uppercase">Link Oficial do Booksy (Agendamento)</label>
                      <div className="flex gap-2 mt-1">
                        <input 
                          type="text" 
                          value={data?.config?.link_booksy || ""}
                          onChange={(e) => setData({ ...data, config: { ...data.config, link_booksy: e.target.value } })}
                          placeholder="https://booksy.com/pt-br/..."
                          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-medium"
                        />
                        {data?.config?.link_booksy && (
                          <a
                            href={data.config.link_booksy}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3.5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Abrir Booksy
                          </a>
                        )}
                      </div>
                      <span className="text-[11px] text-zinc-500 mt-1 block">
                        Este link é enviado automaticamente quando os clientes solicitam agendamento ou perguntam como marcar horário.
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* CARD 2: INTELIGÊNCIA ARTIFICIAL (ELAINE.IA) */}
              {(subTabConfig === "todas" || subTabConfig === "ia") && (
                <div className="p-6 bg-gradient-to-br from-zinc-950 via-zinc-900/90 to-zinc-950 border border-amber-500/40 rounded-3xl space-y-4 shadow-xl shadow-amber-500/5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-amber-500/10 rounded-2xl border border-amber-500/20 text-amber-400">
                        <Sparkles className="w-5 h-5 text-amber-400" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-base text-white flex items-center gap-2">
                          Inteligência Artificial (Elaine.IA)
                          <span className="text-[10px] bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-0.5 rounded-full font-mono font-bold uppercase">
                            Assistente Virtual Delicada & Formal
                          </span>
                        </h4>
                        <p className="text-xs text-zinc-400">
                          Atendimento educado, formal e acolhedor com a assistente Elaine.IA no WhatsApp
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold border ${
                        data?.config?.gemini_ativo !== 0 && data?.config?.gemini_api_key?.trim()
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : !data?.config?.gemini_api_key?.trim()
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                            : "bg-zinc-800 text-zinc-400 border-zinc-700"
                      }`}>
                        {data?.config?.gemini_ativo !== 0 && data?.config?.gemini_api_key?.trim()
                          ? "● Elaine.IA Pronta & Ativa"
                          : !data?.config?.gemini_api_key?.trim()
                            ? "○ Aguardando API Key"
                            : "✕ IA Desativada"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setData({
                          ...data,
                          config: { ...data.config, gemini_ativo: data?.config?.gemini_ativo === 0 ? 1 : 0 }
                        })}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition border ${
                          data?.config?.gemini_ativo !== 0
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30"
                            : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700 hover:text-zinc-200"
                        }`}
                      >
                        {data?.config?.gemini_ativo !== 0 ? "Ligado" : "Desligado"}
                      </button>
                    </div>
                  </div>

                  {/* Chave de API */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-zinc-300 uppercase tracking-wide flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                        Chave de Integração da Inteligência Artificial
                      </label>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <input
                          type={mostrarKeyGemini ? "text" : "password"}
                          value={data?.config?.gemini_api_key || ""}
                          onChange={(e) => setData({ ...data, config: { ...data.config, gemini_api_key: e.target.value } })}
                          placeholder="Cole aqui a chave de ativação da IA..."
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 pr-10 text-sm text-white font-mono placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => setMostrarKeyGemini(!mostrarKeyGemini)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-1"
                          title={mostrarKeyGemini ? "Ocultar Chave" : "Exibir Chave"}
                        >
                          {mostrarKeyGemini ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={testandoGemini || !data?.config?.gemini_api_key?.trim()}
                        onClick={testarChaveGemini}
                        className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 border border-zinc-700 transition shadow-sm whitespace-nowrap"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${testandoGemini ? "animate-spin" : ""}`} />
                        {testandoGemini ? "Testando Conexão..." : "Testar Chave"}
                      </button>
                    </div>

                    {resultadoGemini && (
                      <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                        resultadoGemini.success
                          ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
                          : "bg-red-950/40 border-red-500/30 text-red-300"
                      }`}>
                        {resultadoGemini.success ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                        <span>{resultadoGemini.msg}</span>
                      </div>
                    )}
                  </div>

                  {/* Prompt Personalizado */}
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-xs font-bold text-zinc-300 uppercase tracking-wide">
                          Instruções de Personalidade (Prompt da Elaine.IA)
                        </label>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Defina como a Elaine.IA se apresenta e conversa com seus clientes. Preços, serviços e Booksy são atualizados automaticamente em tempo real.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setData({ ...data, config: { ...data.config, gemini_prompt_personalizado: PROMPT_PADRAO_GEMINI } });
                          mostrarFeedback("Prompt oficial da Elaine.IA restaurado!");
                        }}
                        className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium border border-zinc-700 flex items-center gap-1.5 transition flex-shrink-0"
                      >
                        <RotateCcw className="w-3 h-3 text-amber-400" />
                        Restaurar Padrão
                      </button>
                    </div>

                    <textarea
                      rows={6}
                      value={data?.config?.gemini_prompt_personalizado || ""}
                      onChange={(e) => setData({ ...data, config: { ...data.config, gemini_prompt_personalizado: e.target.value } })}
                      placeholder={PROMPT_PADRAO_GEMINI}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500 font-mono leading-relaxed resize-y"
                    />
                  </div>

                  {/* Informações de Operação */}
                  <div className="p-3.5 bg-zinc-950/80 rounded-xl border border-zinc-800/80 text-xs text-zinc-400 leading-relaxed space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-amber-300">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Como a Elaine.IA opera no WhatsApp:</span>
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-[11px] text-zinc-400">
                      <li><strong className="text-zinc-200">Alta Performance & Baixa Latência:</strong> Otimizada com resposta em menos de 3 segundos no WhatsApp.</li>
                      <li><strong className="text-zinc-200">Apresentação Única:</strong> Apresenta-se apenas no início da conversa ou na primeira mensagem, evitando repetições cansativas.</li>
                      <li><strong className="text-zinc-200">Fallback Automático:</strong> Se a IA demorar mais de 4,5s, o robô responde instantaneamente pelas palavras-chave tradicionais (Booksy, tabela de preços, endereço, Pix).</li>
                      <li><strong className="text-zinc-200">Memória de Conversa:</strong> Lembra das últimas 6 mensagens trocadas com cada cliente para manter o contexto fluído.</li>
                      <li><strong className="text-zinc-200">Prioridade aos Comandos:</strong> Os comandos <code>#menu</code>, <code>#sair</code>, <code>#iniciar</code> e <code>#ativar</code> têm prioridade máxima.</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* CARD 3: ENDEREÇO & LOCALIZAÇÃO GPS */}
              {(subTabConfig === "todas" || subTabConfig === "localizacao") && (
                <div className="bg-zinc-900/60 p-6 rounded-3xl border border-zinc-800/80 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-amber-500/10 rounded-2xl border border-amber-500/20 text-amber-400">
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-base text-white">Endereço & Localização GPS no WhatsApp</h3>
                        <p className="text-xs text-zinc-400">Card nativo interativo com mapa e rotas enviado automaticamente</p>
                      </div>
                    </div>
                    <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-full font-bold">
                      WhatsApp GPS Card Ativo
                    </span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-1">
                    {/* Coluna 1: Endereço & Link Google Maps */}
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-bold text-zinc-400 uppercase">Endereço Completo da Barbearia</label>
                        <input 
                          type="text" 
                          value={data?.config?.endereco || ""}
                          onChange={(e) => setData({ ...data, config: { ...data.config, endereco: e.target.value } })}
                          placeholder="Ex: Rua Exemplo da GM, 100 - São Paulo/SP"
                          className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-medium"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-zinc-400 uppercase">Link do Google Maps</label>
                        <div className="flex gap-2 mt-1">
                          <input 
                            type="text" 
                            value={data?.config?.link_google_maps || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              let lat = data?.config?.latitude;
                              let lng = data?.config?.longitude;
                              const mArroba = val.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
                              const mQuery = val.match(/[?&](?:q|ll|query)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
                              const mData = val.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
                              const mDireto = val.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
                              if (mArroba) { lat = mArroba[1]; lng = mArroba[2]; }
                              else if (mQuery) { lat = mQuery[1]; lng = mQuery[2]; }
                              else if (mData) { lat = mData[1]; lng = mData[2]; }
                              else if (mDireto) { lat = mDireto[1]; lng = mDireto[2]; }
                              setData({ ...data, config: { ...data.config, link_google_maps: val, latitude: lat, longitude: lng } });
                            }}
                            placeholder="https://maps.google.com/?q=..."
                            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-medium"
                          />
                          {data?.config?.link_google_maps && (
                            <a
                              href={data.config.link_google_maps}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3.5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Abrir Maps
                            </a>
                          )}
                        </div>

                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (!data?.config?.endereco) {
                                mostrarFeedback("Preencha o endereço completo primeiro para gerar o link.", "error");
                                return;
                              }
                              const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.config.endereco)}`;
                              setData({ ...data, config: { ...data.config, link_google_maps: url } });
                              mostrarFeedback("Link gerado a partir do endereço!");
                            }}
                            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium border border-zinc-700 flex items-center gap-1.5 transition"
                          >
                            <Navigation className="w-3.5 h-3.5 text-amber-400" />
                            Gerar Link a partir do Endereço
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Coluna 2: Coordenadas GPS & Card Explicativo */}
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-bold text-zinc-400 uppercase">Latitude GPS (ex: -23.550520)</label>
                          <input 
                            type="text" 
                            value={data?.config?.latitude ?? ""}
                            onChange={(e) => setData({ ...data, config: { ...data.config, latitude: e.target.value } })}
                            placeholder="-23.550520"
                            className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-zinc-400 uppercase">Longitude GPS (ex: -46.633308)</label>
                          <input 
                            type="text" 
                            value={data?.config?.longitude ?? ""}
                            onChange={(e) => setData({ ...data, config: { ...data.config, longitude: e.target.value } })}
                            placeholder="-46.633308"
                            className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                          />
                        </div>
                      </div>

                      <div className="p-3.5 bg-zinc-950/70 rounded-2xl border border-zinc-800/80 text-xs text-zinc-400 leading-relaxed space-y-1">
                        <span className="font-bold text-amber-400 block">💡 Card GPS Nativo no WhatsApp:</span>
                        <p>
                          Quando o cliente perguntar <em>"onde fica"</em> ou <em>"endereço"</em>, o robô enviará automaticamente o <strong>Card Oficial do Mapa do WhatsApp</strong> com botão de rota no Waze e Google Maps usando essas coordenadas.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CARD 4: HORÁRIOS & PIX */}
              {(subTabConfig === "todas" || subTabConfig === "horarios") && (
                <div className="bg-zinc-900/60 p-6 rounded-3xl border border-zinc-800/80 space-y-4 shadow-sm">
                  <div className="flex items-center gap-3 pb-2 border-b border-zinc-800/80">
                    <div className="p-2.5 bg-amber-500/10 rounded-2xl border border-amber-500/20 text-amber-400">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base text-white">Horários de Atendimento & Chave Pix</h3>
                      <p className="text-xs text-zinc-400">Informações financeiras e de expediente informadas aos clientes</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-1">
                    {/* Coluna 1: Chave Pix */}
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-bold text-zinc-400 uppercase">Chave Pix Oficial da Barbearia</label>
                        <input 
                          type="text" 
                          value={data?.config?.chave_pix || ""}
                          onChange={(e) => setData({ ...data, config: { ...data.config, chave_pix: e.target.value } })}
                          placeholder="Telefone, CNPJ, E-mail ou Chave Aleatória"
                          className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-medium font-mono"
                        />
                        <span className="text-[11px] text-zinc-500 mt-1 block">
                          Utilizada na resposta automática de pagamentos e nos lembretes de renovação do Clube VIP.
                        </span>
                      </div>
                    </div>

                    {/* Coluna 2: Horários & Modelos Rápidos */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-zinc-400 uppercase">
                          Horários de Funcionamento da Barbearia
                        </label>
                        <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">
                          Variável {"{horario}"}
                        </span>
                      </div>

                      <textarea 
                        rows={4}
                        value={data?.config?.horario_funcionamento || ""}
                        onChange={(e) => setData({ ...data, config: { ...data.config, horario_funcionamento: e.target.value } })}
                        placeholder="Ex:&#10;• Terça a Sexta: 09h às 20h&#10;• Sábado: 08h30 às 19h&#10;• Domingo e Segunda: Fechado"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-medium leading-relaxed resize-none"
                      />

                      {/* Modelos rápidos */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-[10px] text-zinc-500 font-bold uppercase">Modelos Rápidos:</span>
                        <button
                          type="button"
                          onClick={() => setData({
                            ...data,
                            config: {
                              ...data.config,
                              horario_funcionamento: "• Terça a Sexta: 09h às 20h\n• Sábado: 08h30 às 19h\n• Domingo e Segunda: Fechado"
                            }
                          })}
                          className="px-2.5 py-1 bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 rounded-lg text-xs font-medium border border-zinc-700/60 transition"
                        >
                          Terça a Sábado (Padrão GM)
                        </button>
                        <button
                          type="button"
                          onClick={() => setData({
                            ...data,
                            config: {
                              ...data.config,
                              horario_funcionamento: "• Segunda a Sexta: 09h às 20h\n• Sábado: 09h às 18h\n• Domingo: Fechado"
                            }
                          })}
                          className="px-2.5 py-1 bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 rounded-lg text-xs font-medium border border-zinc-700/60 transition"
                        >
                          Segunda a Sábado
                        </button>
                        <button
                          type="button"
                          onClick={() => setData({
                            ...data,
                            config: {
                              ...data.config,
                              horario_funcionamento: "• Segunda a Domingo: 09h às 21h (Todos os dias)"
                            }
                          })}
                          className="px-2.5 py-1 bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 rounded-lg text-xs font-medium border border-zinc-700/60 transition"
                        >
                          Todos os Dias
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CARD 5: PAUSA HUMANA & AUTOMAÇÕES */}
              {(subTabConfig === "todas" || subTabConfig === "automacoes") && (
                <div className="bg-zinc-900/60 p-6 rounded-3xl border border-zinc-800/80 space-y-6 shadow-sm">
                  <div className="flex items-center gap-3 pb-2 border-b border-zinc-800/80">
                    <div className="p-2.5 bg-amber-500/10 rounded-2xl border border-amber-500/20 text-amber-400">
                      <Bell className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base text-white">Intervenção Humana & Automações do Robô</h3>
                      <p className="text-xs text-zinc-400">Regras para o robô não falar por cima do atendente e aviso de renovação do Clube VIP</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-1">
                    {/* Coluna 1: Intervenção Humana */}
                    <div className="p-4 bg-zinc-950/70 border border-zinc-800 rounded-2xl space-y-3">
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-emerald-400" />
                        <h4 className="font-bold text-sm text-white">Pausa Automática Inteligente</h4>
                      </div>
                      <p className="text-xs text-zinc-400">
                        Quando você digita no WhatsApp pelo celular, o robô pausa automaticamente para você atender o cliente sem interrupções.
                      </p>

                      <div className="pt-1">
                        <label className="text-xs font-bold text-zinc-400 uppercase">Tempo de Pausa do Robô (Minutos)</label>
                        <input 
                          type="number" 
                          min="5" 
                          max="1440"
                          placeholder="120"
                          value={data?.config?.tempo_pausa_humano_minutos ?? 120}
                          onChange={(e) => setData({
                            ...data,
                            config: { ...data.config, tempo_pausa_humano_minutos: Number(e.target.value) }
                          })}
                          className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-white focus:border-amber-500 outline-none font-mono"
                        />
                      </div>

                      <div className="p-3 bg-zinc-900/80 rounded-xl border border-zinc-800/80 text-xs text-zinc-400 leading-relaxed space-y-1">
                        <ul className="list-disc list-inside space-y-1 text-[11px] text-zinc-400">
                          <li><strong>Reativação Automática:</strong> Se o cliente mandar qualquer saudação (como <em>"oi"</em>, <em>"olá"</em>, <em>"boa tarde"</em>) após a conversa, a Elaine.IA reativa na hora.</li>
                          <li><strong>Controle pelo Painel:</strong> Você pode assumir ou devolver conversas para a Elaine.IA com 1 clique na aba <strong>Conversas & IA</strong>.</li>
                        </ul>
                      </div>
                    </div>

                    {/* Coluna 2: Lembrete de Renovação Clube VIP */}
                    <div className="p-4 bg-zinc-950/70 border border-zinc-800 rounded-2xl space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Bell className="w-4 h-4 text-amber-400" />
                          <h4 className="font-bold text-sm text-white">Aviso de Renovação Clube VIP</h4>
                        </div>
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                          data?.config?.aviso_renovacao_ativo !== 0
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : "bg-zinc-800 text-zinc-400 border-zinc-700"
                        }`}>
                          {data?.config?.aviso_renovacao_ativo !== 0 ? "Automação Ativa" : "Desativado"}
                        </span>
                      </div>

                      <div className="space-y-4 pt-1">
                        <div>
                          <label className="text-xs font-bold text-zinc-400 uppercase">
                            Avisar com Quantos Dias de Antecedência?
                          </label>
                          <div className="flex items-center gap-2 mt-1">
                            <input 
                              type="number" 
                              min="1" 
                              max="30"
                              value={data?.config?.dias_aviso_renovacao ?? 3}
                              onChange={(e) => setData({ 
                                ...data, 
                                config: { ...data.config, dias_aviso_renovacao: Math.max(1, Number(e.target.value)) } 
                              })}
                              className="w-24 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white font-bold text-center focus:outline-none focus:border-amber-500 font-mono"
                            />
                            <span className="text-xs text-zinc-400 font-medium">dias antes do vencimento</span>
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-bold text-zinc-400 uppercase">Status do Disparo</label>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setData({
                                ...data,
                                config: { ...data.config, aviso_renovacao_ativo: data?.config?.aviso_renovacao_ativo === 0 ? 1 : 0 }
                              })}
                              className={`px-4 py-2 rounded-xl text-xs font-bold transition border ${
                                data?.config?.aviso_renovacao_ativo !== 0
                                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30"
                                  : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700 text-zinc-300"
                              }`}
                            >
                              {data?.config?.aviso_renovacao_ativo !== 0 ? "✓ Ligado" : "✕ Desligado"}
                            </button>

                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const res = await fetch("/api/whatsapp/lembretes", { method: "POST" });
                                  const json = await res.json();
                                  if (json.success) {
                                    mostrarFeedback(`Checagem realizada! ${json.enviados} lembrete(s) enviado(s) no WhatsApp.`);
                                  } else {
                                    mostrarFeedback("Erro ao verificar lembretes", "error");
                                  }
                                } catch (e) {
                                  mostrarFeedback("Falha na requisição", "error");
                                }
                              }}
                              className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-zinc-700 transition"
                              title="Verifica clientes próximos do vencimento e dispara agora"
                            >
                              <Send className="w-3.5 h-3.5 text-amber-400" />
                              Disparar Agora
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CARD 6: SEGURANÇA & SENHA */}
              {(subTabConfig === "todas" || subTabConfig === "seguranca") && (
                <div className="bg-zinc-900/60 p-6 rounded-3xl border border-zinc-800/80 space-y-4 shadow-sm">
                  <div className="flex items-center gap-3 pb-2 border-b border-zinc-800/80">
                    <div className="p-2.5 bg-amber-500/10 rounded-2xl border border-amber-500/20 text-amber-400">
                      <Lock className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base text-white">Segurança do Painel & Senha de Acesso</h3>
                      <p className="text-xs text-zinc-400">Proteja as configurações contra acessos indevidos no Wi-Fi</p>
                    </div>
                  </div>

                  <div className="max-w-md space-y-2 pt-1">
                    <label className="text-xs font-bold text-zinc-400 uppercase">Definir Nova Senha de Administrador</label>
                    <input 
                      type="password" 
                      placeholder="Deixe em branco para manter a senha atual"
                      value={novaSenhaAdmin}
                      onChange={(e) => setNovaSenhaAdmin(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-medium font-mono"
                    />
                    <span className="text-[11px] text-zinc-500 block">
                      Mínimo de 4 dígitos. Senha padrão inicial de fábrica: <strong className="text-zinc-400 font-mono">admin123</strong>
                    </span>
                  </div>
                </div>
              )}

              {/* BARRA FLUTUANTE FIXA DE SALVAR */}
              {subTabConfig !== "atualizacoes" && (
                <div className="sticky bottom-4 z-20 bg-zinc-900/95 backdrop-blur-md border border-amber-500/30 p-3.5 sm:p-4 rounded-2xl shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></div>
                    <div>
                      <span className="text-xs font-bold text-white block">Salvar Configurações</span>
                      <span className="text-[11px] text-zinc-400">Alterações são gravadas diretamente no banco de dados SQLite local</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => carregarDados()}
                      className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition flex-1 sm:flex-none text-center"
                    >
                      Descartar
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-1.5 flex-1 sm:flex-none"
                    >
                      <Check className="w-4 h-4" />
                      Salvar Alterações
                    </button>
                  </div>
                </div>
              )}
            </form>

            {/* CARD 7: ATUALIZAÇÕES DO SISTEMA (GITHUB AUTO-UPDATER) */}
            {(subTabConfig === "todas" || subTabConfig === "atualizacoes") && (
              <div className="bg-zinc-900/60 p-6 rounded-3xl border border-zinc-800/80 space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-800/80">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-500/10 rounded-2xl border border-amber-500/20 text-amber-400">
                      <RefreshCw className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                        Atualizações do Sistema
                        {statusAtualizacao?.temAtualizacao && (
                          <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                            Nova Versão Disponível
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-zinc-400">
                        Versão do código instalada neste notebook e sincronização remota via GitHub
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => checarAtualizacoes(false)}
                    disabled={verificandoAtualizacao || aplicandoAtualizacao}
                    className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-bold border border-zinc-700 flex items-center gap-1.5 transition disabled:opacity-50 whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${verificandoAtualizacao ? "animate-spin" : ""}`} />
                    {verificandoAtualizacao ? "Verificando..." : "Buscar Atualizações"}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="bg-zinc-950/70 p-3.5 rounded-2xl border border-zinc-800/70">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 block">Versão Instalada</span>
                    <span className="text-xs font-mono font-bold text-white flex items-center gap-1.5 mt-1">
                      <GitBranch className="w-3.5 h-3.5 text-amber-400" />
                      {statusAtualizacao?.versaoAtual ? `commit #${statusAtualizacao.versaoAtual}` : "v1.0.0"}
                    </span>
                    {statusAtualizacao?.dataCommit && (
                      <span className="text-[10px] text-zinc-500 block mt-1">Data: {statusAtualizacao.dataCommit}</span>
                    )}
                  </div>

                  <div className="bg-zinc-950/70 p-3.5 rounded-2xl border border-zinc-800/70">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 block">Status da Conexão</span>
                    <span className="text-xs font-bold text-white flex items-center gap-1.5 mt-1">
                      <span className={`w-2 h-2 rounded-full ${statusAtualizacao?.temAtualizacao ? "bg-amber-400 animate-ping" : "bg-emerald-400"}`} />
                      {statusAtualizacao?.temAtualizacao 
                        ? `${statusAtualizacao.commitsAtras} melhoria(s) pendente(s)` 
                        : (statusAtualizacao?.configurado ? "Sistema 100% Atualizado" : "Repositório Local Pronto")}
                    </span>
                    <span className="text-[10px] text-zinc-500 block mt-1 truncate">
                      {statusAtualizacao?.remoteUrl || "GitHub Remoto"}
                    </span>
                  </div>
                </div>

                {statusAtualizacao?.temAtualizacao && (
                  <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl space-y-3">
                    <div>
                      <h4 className="text-xs font-bold text-emerald-300">🎉 O que mudou nesta atualização:</h4>
                      <ul className="mt-1.5 space-y-1 text-xs text-zinc-300">
                        {statusAtualizacao.novidades?.map((novidade, idx) => (
                          <li key={idx} className="flex items-center gap-1.5 font-mono text-[11px]">
                            <span className="text-emerald-400 font-bold">•</span> {novidade}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      type="button"
                      onClick={aplicarAtualizacao}
                      disabled={aplicandoAtualizacao}
                      className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                    >
                      <Download className={`w-4 h-4 ${aplicandoAtualizacao ? "animate-bounce" : ""}`} />
                      {aplicandoAtualizacao ? "Baixando e Aplicando Atualizações..." : "Instalar Atualizações Agora (1-Clique)"}
                    </button>
                  </div>
                )}

                {statusAtualizacao?.aviso && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300">
                    {statusAtualizacao.aviso}
                  </div>
                )}

                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  🛡️ <strong className="text-zinc-400">Proteção de Dados:</strong> O banco de dados de clientes, cortes registrados e a conexão do WhatsApp estão protegidos no <code>.gitignore</code> e <strong>nunca</strong> são afetados ou sobrescritos durante atualizações.
                </p>
              </div>
            )}
          </div>
        )}


      </main>

      {/* ======================================================== */}
      {/* MODAL: NOVO CLIENTE VIP                                  */}
      {/* ======================================================== */}
            {/* ======================================================== */}
      {/* MODAL: IMPORTAR CLIENTES VIA EXCEL                       */}
      {/* ======================================================== */}
      {modalImportarExcel && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" /> Importar Clientes via Planilha Excel
              </h3>
              <button 
                onClick={() => {
                  setModalImportarExcel(false);
                  setArquivoExcel(null);
                  setResultadoImportacao(null);
                }} 
                className="text-zinc-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Aviso Explicativo Inteligente */}
            <div className="p-3.5 bg-zinc-950/70 border border-zinc-800 rounded-2xl text-xs space-y-1.5">
              <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" /> Atualização Segura e Automática:
              </div>
              <p className="text-zinc-300 leading-relaxed">
                • <strong>Clientes já existentes:</strong> Se o número de WhatsApp já estiver no sistema, os dados (como saldo de cortes e vencimento) serão <strong>atualizados</strong> sem duplicar nem dar cortes de graça.
              </p>
              <p className="text-zinc-300 leading-relaxed">
                • <strong>Novos clientes:</strong> Linhas com novos números de WhatsApp serão adicionadas como novos assinantes VIP.
              </p>
            </div>

            {/* Feedback / Resumo da Importação */}
            {resultadoImportacao && (
              <div className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800 space-y-2">
                <div className="font-extrabold text-white text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Importação Finalizada com Sucesso!
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                  <div className="bg-emerald-500/10 border border-emerald-500/30 p-2.5 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 block">Novos Cadastrados</span>
                    <span className="text-lg font-black text-white">{resultadoImportacao.novos}</span>
                  </div>
                  <div className="bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-bold text-amber-400 block">Clientes Atualizados</span>
                    <span className="text-lg font-black text-white">{resultadoImportacao.atualizados}</span>
                  </div>
                </div>

                {resultadoImportacao.erros && resultadoImportacao.erros.length > 0 && (
                  <div className="mt-2 p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 space-y-1">
                    <span className="font-bold block">⚠️ Atenção: {resultadoImportacao.erros.length} linha(s) ignoradas por erro:</span>
                    <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                      {resultadoImportacao.erros.slice(0, 5).map((e: any, idx: number) => (
                        <li key={idx}>Linha {e.linha}: {e.motivo}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleImportarExcel} className="space-y-4 text-xs">
              
              {/* Campo de Upload de Arquivo */}
              <div>
                <label className="font-bold text-zinc-300 uppercase block mb-1.5">
                  Selecione o arquivo da planilha (.xlsx, .xls ou .csv)
                </label>
                <div className="border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 rounded-2xl p-6 text-center transition bg-zinc-950/40">
                  <input
                    type="file"
                    id="excel_file_input"
                    accept=".xlsx, .xls, .csv"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setArquivoExcel(e.target.files[0]);
                        setResultadoImportacao(null);
                      }
                    }}
                    className="hidden"
                  />
                  <label htmlFor="excel_file_input" className="cursor-pointer flex flex-col items-center gap-2">
                    <FileSpreadsheet className="w-10 h-10 text-emerald-400" />
                    <span className="font-bold text-sm text-zinc-200">
                      {arquivoExcel ? arquivoExcel.name : "Clique para escolher o arquivo Excel"}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      {arquivoExcel 
                        ? `${(arquivoExcel.size / 1024).toFixed(1)} KB selecionado` 
                        : "Formatos aceitos: Microsoft Excel (.xlsx, .xls) ou CSV"}
                    </span>
                  </label>
                </div>
              </div>

              {/* Link para Baixar Modelo */}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-800">
                <span className="text-zinc-400">Precisa do modelo padrão?</span>
                <a
                  href="/api/mensalistas/excel?tipo=modelo"
                  download="modelo_clientes_vip_gm.xlsx"
                  className="text-amber-400 hover:underline font-bold flex items-center gap-1"
                >
                  <FileDown className="w-3.5 h-3.5" /> Baixar Planilha Modelo de Exemplo
                </a>
              </div>

              {/* Botões do Modal */}
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setModalImportarExcel(false);
                    setArquivoExcel(null);
                    setResultadoImportacao(null);
                  }}
                  className="px-4 py-2.5 rounded-xl text-zinc-400 hover:text-white font-medium"
                >
                  Fechar
                </button>

                <button
                  type="submit"
                  disabled={!arquivoExcel || importandoExcel}
                  className={`px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition ${
                    !arquivoExcel || importandoExcel
                      ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                      : "bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20 active:scale-95"
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  {importandoExcel ? "Processando Planilha..." : "Processar e Atualizar Clientes"}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {modalNovoMensalista && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-400" /> Cadastrar Novo Assinante VIP
              </h3>
              <button onClick={() => setModalNovoMensalista(false)} className="text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCriarMensalista} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-zinc-300 uppercase">Nome Completo</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ex: João da Silva"
                  value={formMensalista.nome}
                  onChange={(e) => setFormMensalista({ ...formMensalista, nome: e.target.value })}
                  className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-zinc-300 uppercase">WhatsApp do Cliente (DDD + Celular)</label>
                <input 
                  type="text" 
                  required
                  maxLength={15}
                  placeholder="(11) 99999-9999"
                  value={formMensalista.whatsapp}
                  onChange={(e) => setFormMensalista({ ...formMensalista, whatsapp: formatarTelefoneBR(e.target.value) })}
                  className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-zinc-300 uppercase">Plano Base Contratado</label>
                <select 
                  value={formMensalista.plano_id}
                  onChange={(e) => {
                    const selId = e.target.value;
                    const p = data.planos.find((x: any) => x.id === selId);
                    setFormMensalista({
                      ...formMensalista,
                      plano_id: selId,
                      valor_pago: p ? p.preco_mensal?.toString() : formMensalista.valor_pago,
                      cortes_restantes: p ? p.cortes_cabelo_inclusos : 4,
                      barbas_restantes: p ? p.barbas_inclusas : 0,
                      sobrancelhas_restantes: p?.inclui_sobrancelha ? 1 : 0
                    });
                  }}
                  className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                >
                  {data?.planos?.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.nome} - R$ {Number(p.preco_mensal).toFixed(2)} ({p.cortes_cabelo_inclusos} cortes / {p.barbas_inclusas} barbas)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-zinc-300 uppercase">Valor Pago (R$)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    required
                    value={formMensalista.valor_pago}
                    onChange={(e) => setFormMensalista({ ...formMensalista, valor_pago: e.target.value })}
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-zinc-300 uppercase">Data de Vencimento</label>
                  <input 
                    type="date" 
                    required
                    value={formMensalista.data_vencimento}
                    onChange={(e) => setFormMensalista({ ...formMensalista, data_vencimento: e.target.value })}
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-zinc-300 uppercase">Cortes Cabelo</label>
                  <input 
                    type="number" 
                    min="0"
                    value={formMensalista.cortes_restantes}
                    onChange={(e) => setFormMensalista({ ...formMensalista, cortes_restantes: Number(e.target.value) })}
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-zinc-300 uppercase">Barba</label>
                  <input 
                    type="number" 
                    min="0"
                    value={formMensalista.barbas_restantes}
                    onChange={(e) => setFormMensalista({ ...formMensalista, barbas_restantes: Number(e.target.value) })}
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-zinc-300 uppercase">Sobrancelhas</label>
                  <input 
                    type="number" 
                    min="0"
                    value={formMensalista.sobrancelhas_restantes}
                    onChange={(e) => setFormMensalista({ ...formMensalista, sobrancelhas_restantes: Number(e.target.value) })}
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-zinc-300 uppercase">Observações / Preferências</label>
                <textarea 
                  rows={2}
                  placeholder="Ex: Prefere corte degradê na zero, toalha quente..."
                  value={formMensalista.observacoes}
                  onChange={(e) => setFormMensalista({ ...formMensalista, observacoes: e.target.value })}
                  className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-white focus:border-amber-500 outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => setModalNovoMensalista(false)} 
                  className="px-4 py-2 rounded-xl text-zinc-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="bg-amber-500 hover:bg-amber-400 text-black px-5 py-2 rounded-xl font-bold text-sm"
                >
                  Ativar Cliente VIP
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* ======================================================== */}
      {/* MODAL: EDITAR CLIENTE VIP                                */}
      {/* ======================================================== */}
      {modalEditarMensalista && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Edit className="w-5 h-5 text-amber-400" /> Editar Cliente VIP
              </h3>
              <button onClick={() => setModalEditarMensalista(null)} className="text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditarMensalista} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-zinc-300 uppercase">Nome</label>
                <input 
                  type="text" 
                  required
                  value={modalEditarMensalista.nome}
                  onChange={(e) => setModalEditarMensalista({ ...modalEditarMensalista, nome: e.target.value })}
                  className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-zinc-300 uppercase">WhatsApp (DDD + Celular)</label>
                <input 
                  type="text" 
                  required
                  maxLength={15}
                  value={modalEditarMensalista.whatsapp}
                  onChange={(e) => setModalEditarMensalista({ ...modalEditarMensalista, whatsapp: formatarTelefoneBR(e.target.value) })}
                  className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-zinc-300 uppercase">Valor Pago (R$)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={modalEditarMensalista.valor_pago}
                    onChange={(e) => setModalEditarMensalista({ ...modalEditarMensalista, valor_pago: e.target.value })}
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-zinc-300 uppercase">Data Vencimento</label>
                  <input 
                    type="date" 
                    value={modalEditarMensalista.data_vencimento}
                    onChange={(e) => setModalEditarMensalista({ ...modalEditarMensalista, data_vencimento: e.target.value })}
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="font-bold text-zinc-300 uppercase text-xs">Cortes</label>
                  <input 
                    type="number" 
                    min="0"
                    value={modalEditarMensalista.cortes_restantes}
                    onChange={(e) => setModalEditarMensalista({ ...modalEditarMensalista, cortes_restantes: Number(e.target.value) })}
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-zinc-300 uppercase text-xs">Barbas</label>
                  <input 
                    type="number" 
                    min="0"
                    value={modalEditarMensalista.barbas_restantes}
                    onChange={(e) => setModalEditarMensalista({ ...modalEditarMensalista, barbas_restantes: Number(e.target.value) })}
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-zinc-300 uppercase text-xs">Sobrancelhas</label>
                  <input 
                    type="number" 
                    min="0"
                    value={modalEditarMensalista.sobrancelhas_restantes ?? 0}
                    onChange={(e) => setModalEditarMensalista({ ...modalEditarMensalista, sobrancelhas_restantes: Number(e.target.value) })}
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-zinc-300 uppercase text-xs">Status</label>
                  <select 
                    value={modalEditarMensalista.status}
                    onChange={(e) => setModalEditarMensalista({ ...modalEditarMensalista, status: e.target.value })}
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                  >
                    <option value="ATIVO">ATIVO</option>
                    <option value="PENDENTE">PENDENTE</option>
                    <option value="VENCIDO">VENCIDO</option>
                    <option value="CANCELADO">CANCELADO</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-zinc-300 uppercase">Observações</label>
                <textarea 
                  rows={2}
                  value={modalEditarMensalista.observacoes || ""}
                  onChange={(e) => setModalEditarMensalista({ ...modalEditarMensalista, observacoes: e.target.value })}
                  className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-white focus:border-amber-500 outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => setModalEditarMensalista(null)} 
                  className="px-4 py-2 rounded-xl text-zinc-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="bg-amber-500 hover:bg-amber-400 text-black px-5 py-2 rounded-xl font-bold text-sm"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* ======================================================== */}
      {/* MODAL: CRIAR / EDITAR PLANO VIP                          */}
      {/* ======================================================== */}
      {(modalNovoPlano || modalEditarPlano) && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-amber-400" /> 
                {modalEditarPlano ? "Editar Plano VIP" : "Criar Novo Plano VIP"}
              </h3>
              <button 
                onClick={() => { setModalNovoPlano(false); setModalEditarPlano(null); }} 
                className="text-zinc-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form 
              onSubmit={(e) => handleSalvarPlano(e, formPlano, !!modalEditarPlano)} 
              className="space-y-4 text-xs"
            >
              <div>
                <label className="font-bold text-zinc-300 uppercase">Nome do Plano</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ex: Corte Semanal GM"
                  value={formPlano.nome}
                  onChange={(e) => setFormPlano({ ...formPlano, nome: e.target.value })}
                  className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-zinc-300 uppercase">Preço Mensal (R$)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    required
                    placeholder="130.00"
                    value={formPlano.preco_mensal}
                    onChange={(e) => setFormPlano({ ...formPlano, preco_mensal: e.target.value })}
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-zinc-300 uppercase">Cortes Cabelo</label>
                  <input 
                    type="number" 
                    min="0"
                    required
                    value={formPlano.cortes_cabelo_inclusos}
                    onChange={(e) => setFormPlano({ ...formPlano, cortes_cabelo_inclusos: Number(e.target.value) })}
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 items-center">
                <div>
                  <label className="font-bold text-zinc-300 uppercase">Barbas Inclusas</label>
                  <input 
                    type="number" 
                    min="0"
                    value={formPlano.barbas_inclusas}
                    onChange={(e) => setFormPlano({ ...formPlano, barbas_inclusas: Number(e.target.value) })}
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                  />
                </div>

                <div className="pt-4 flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="chk_sob"
                    checked={!!formPlano.inclui_sobrancelha}
                    onChange={(e) => setFormPlano({ ...formPlano, inclui_sobrancelha: e.target.checked })}
                    className="w-4 h-4 rounded text-amber-500 focus:ring-0"
                  />
                  <label htmlFor="chk_sob" className="font-bold text-zinc-300 cursor-pointer">
                    Inclui Sobrancelha
                  </label>
                </div>
              </div>

              <div>
                <label className="font-bold text-zinc-300 uppercase">Descrição / Benefícios</label>
                <textarea 
                  rows={2}
                  value={formPlano.descricao || ""}
                  onChange={(e) => setFormPlano({ ...formPlano, descricao: e.target.value })}
                  className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-white focus:border-amber-500 outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => { setModalNovoPlano(false); setModalEditarPlano(null); }} 
                  className="px-4 py-2 rounded-xl text-zinc-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="bg-amber-500 hover:bg-amber-400 text-black px-5 py-2 rounded-xl font-bold text-sm"
                >
                  {modalEditarPlano ? "Salvar Alterações" : "Criar Plano"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* ======================================================== */}
      {/* MODAL: CRIAR / EDITAR SERVIÇO                            */}
      {/* ======================================================== */}
      {(modalNovoServico || modalEditarServico) && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Scissors className="w-5 h-5 text-amber-400" /> 
                {modalEditarServico ? "Editar Serviço" : "Novo Serviço"}
              </h3>
              <button 
                onClick={() => { setModalNovoServico(false); setModalEditarServico(null); }} 
                className="text-zinc-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form 
              onSubmit={(e) => handleSalvarServico(e, formServico, !!modalEditarServico)} 
              className="space-y-4 text-xs"
            >
              <div>
                <label className="font-bold text-zinc-300 uppercase">Nome do Serviço</label>
                <input 
                  type="text" 
                  required
                  value={formServico.nome}
                  onChange={(e) => setFormServico({ ...formServico, nome: e.target.value })}
                  className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-zinc-300 uppercase">Categoria</label>
                  <select 
                    value={formServico.categoria}
                    onChange={(e) => setFormServico({ ...formServico, categoria: e.target.value })}
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                  >
                    <option value="Cabelo">Cabelo</option>
                    <option value="Barba">Barba</option>
                    <option value="Química">Química</option>
                    <option value="Combos">Combos</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-zinc-300 uppercase">Preço (R$)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    required
                    value={formServico.preco}
                    onChange={(e) => setFormServico({ ...formServico, preco: Number(e.target.value) })}
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-zinc-300 uppercase">Duração (minutos)</label>
                <input 
                  type="number" 
                  value={formServico.duracao_minutos}
                  onChange={(e) => setFormServico({ ...formServico, duracao_minutos: Number(e.target.value) })}
                  className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-zinc-300 uppercase">Descrição</label>
                <textarea 
                  rows={2}
                  value={formServico.descricao || ""}
                  onChange={(e) => setFormServico({ ...formServico, descricao: e.target.value })}
                  className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-white focus:border-amber-500 outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => { setModalNovoServico(false); setModalEditarServico(null); }} 
                  className="px-4 py-2 rounded-xl text-zinc-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="bg-amber-500 hover:bg-amber-400 text-black px-5 py-2 rounded-xl font-bold text-sm"
                >
                  {modalEditarServico ? "Salvar Alterações" : "Cadastrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* ======================================================== */}
      {/* MODAL: CRIAR / EDITAR BARBEIRO                           */}
      {/* ======================================================== */}
      {(modalNovoBarbeiro || modalEditarBarbeiro) && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-400" /> 
                {modalEditarBarbeiro ? "Editar Barbeiro" : "Adicionar Barbeiro"}
              </h3>
              <button 
                onClick={() => { setModalNovoBarbeiro(false); setModalEditarBarbeiro(null); }} 
                className="text-zinc-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form 
              onSubmit={(e) => handleSalvarBarbeiro(e, formBarbeiro, !!modalEditarBarbeiro)} 
              className="space-y-4 text-xs"
            >
              <div>
                <label className="font-bold text-zinc-300 uppercase">Nome do Barbeiro</label>
                <input 
                  type="text" 
                  required
                  value={formBarbeiro.nome}
                  onChange={(e) => setFormBarbeiro({ ...formBarbeiro, nome: e.target.value })}
                  className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-zinc-300 uppercase">WhatsApp (com DDD)</label>
                <input 
                  type="text" 
                  required
                  maxLength={15}
                  placeholder="(11) 99999-9999"
                  value={formBarbeiro.telefone_whatsapp}
                  onChange={(e) => setFormBarbeiro({ ...formBarbeiro, telefone_whatsapp: formatarTelefoneBR(e.target.value) })}
                  className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-zinc-300 uppercase">Cargo / Função</label>
                <select 
                  value={formBarbeiro.tipo}
                  onChange={(e) => setFormBarbeiro({ ...formBarbeiro, tipo: e.target.value })}
                  className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                >
                  <option value="BARBEIRO">Barbeiro</option>
                  <option value="ADMIN">Administrador / Proprietário</option>
                  <option value="ATENDENTE">Atendente</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => { setModalNovoBarbeiro(false); setModalEditarBarbeiro(null); }} 
                  className="px-4 py-2 rounded-xl text-zinc-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="bg-amber-500 hover:bg-amber-400 text-black px-5 py-2 rounded-xl font-bold text-sm"
                >
                  {modalEditarBarbeiro ? "Salvar Alterações" : "Cadastrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: ADICIONAR NOVA CONVERSA AO ROBÔ                   */}
      {/* ======================================================== */}
      {modalNovaConversa && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-xl w-full p-6 space-y-4 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-400" /> Cadastrar Nova Conversa / Fluxo
              </h3>
              <button 
                onClick={() => setModalNovaConversa(false)} 
                className="text-zinc-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCriarConversa} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-zinc-300 uppercase block mb-1">Título da Conversa</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ex: Promoção Dia dos Pais"
                    value={formNovaConversa.titulo}
                    onChange={(e) => setFormNovaConversa({ ...formNovaConversa, titulo: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:border-amber-500 outline-none font-medium"
                  />
                </div>

                <div>
                  <label className="font-bold text-zinc-300 uppercase block mb-1">Categoria do Atendimento</label>
                  <select 
                    value={formNovaConversa.categoria}
                    onChange={(e) => setFormNovaConversa({ ...formNovaConversa, categoria: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:border-amber-500 outline-none font-medium"
                  >
                    <option value="ATENDIMENTO">Atendimento Geral</option>
                    <option value="SERVICOS">Serviços & Tratamentos</option>
                    <option value="MENSALISTA">Clube VIP / Mensalistas</option>
                    <option value="EQUIPE">Equipe & Barbeiros</option>
                    <option value="INFORMACOES">Informações & Pagamentos</option>
                    <option value="OUTROS">Outros / Promoções</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-zinc-300 uppercase block mb-1">
                  Palavras-Chave de Ativação no WhatsApp (Gatilhos)
                </label>
                <input 
                  type="text" 
                  placeholder="Ex: promocao, pai, desconto, especial"
                  value={formNovaConversa.gatilho}
                  onChange={(e) => setFormNovaConversa({ ...formNovaConversa, gatilho: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none font-mono"
                />
                <span className="text-[10px] text-zinc-500 mt-1 block">
                  💡 Separe por vírgulas. Quando o cliente enviar qualquer uma dessas palavras no WhatsApp, o robô responderá com esta mensagem automaticamente!
                </span>
              </div>

              <div>
                <label className="font-bold text-zinc-300 uppercase block mb-1">Descrição Breve</label>
                <input 
                  type="text" 
                  placeholder="Ex: Enviada para clientes que perguntarem de desconto ou promoção"
                  value={formNovaConversa.descricao}
                  onChange={(e) => setFormNovaConversa({ ...formNovaConversa, descricao: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                />
              </div>

              {/* Botões Rápidos de Inserção de Tags */}
              <div className="space-y-1">
                <span className="font-bold text-zinc-400 uppercase text-[10px] block">
                  Inserir Variável Dinâmica:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {["{cliente}", "{link_booksy}", "{barbearia}", "{pix}", "{horario}", "{endereco}"].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setFormNovaConversa(prev => ({ ...prev, mensagem: prev.mensagem + (prev.mensagem.endsWith(" ") || prev.mensagem.length === 0 ? "" : " ") + tag + " " }))}
                      className="px-2 py-0.5 rounded-lg bg-zinc-950 border border-zinc-800 text-[10px] font-mono text-amber-300 font-bold hover:border-amber-400 transition"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-bold text-zinc-300 uppercase block mb-1">
                  Texto da Resposta Automática (WhatsApp)
                </label>
                <textarea 
                  rows={6}
                  required
                  placeholder="Digite aqui o texto que o robô vai enviar no WhatsApp..."
                  value={formNovaConversa.mensagem}
                  onChange={(e) => setFormNovaConversa({ ...formNovaConversa, mensagem: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white focus:border-amber-500 outline-none font-mono leading-relaxed"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => setModalNovaConversa(false)} 
                  className="px-4 py-2 rounded-xl text-zinc-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="bg-amber-500 hover:bg-amber-400 text-black px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-amber-500/10 active:scale-95"
                >
                  <Plus className="w-4 h-4" /> Cadastrar Conversa no Robô
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
