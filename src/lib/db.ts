import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

const DB_DIR = path.join(process.cwd(), "database");
const DB_FILE = path.join(DB_DIR, "barbearia.db");

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const isNew = !fs.existsSync(DB_FILE);
  dbInstance = new DatabaseSync(DB_FILE);

  // Ativar modo WAL para alta velocidade, cache em RAM e concorrência máxima
  dbInstance.exec("PRAGMA journal_mode = WAL;");
  dbInstance.exec("PRAGMA synchronous = NORMAL;");
  dbInstance.exec("PRAGMA cache_size = -64000;"); // 64MB de cache na RAM para consultas instantâneas
  dbInstance.exec("PRAGMA temp_store = MEMORY;"); // Consultas temporárias e ordenações direto na RAM
  dbInstance.exec("PRAGMA mmap_size = 268435456;"); // 256MB memory-mapped I/O para leitura ultra rápida
  dbInstance.exec("PRAGMA busy_timeout = 5000;"); // 5 segundos de tolerância contra concorrência/lock

  initSchema(dbInstance);

  if (isNew) {
    popularDadosIniciaisGM(dbInstance);
  } else {
    // Garantir que dados básicos existam se as tabelas estiverem vazias
    const servicosCount = (dbInstance.prepare("SELECT count(*) as total FROM servicos").get() as any)?.total || 0;
    if (servicosCount === 0) {
      popularDadosIniciaisGM(dbInstance);
    }

    // Garantir que todas as mensagens pré-treinadas do robô existam
    const botCount = (dbInstance.prepare("SELECT count(*) as total FROM bot_mensagens").get() as any)?.total || 0;
    if (botCount < 15) {
      popularMensagensBot(dbInstance);
    }

    // Atualização automática: se a mensagem de boas-vindas ainda for do modelo antigo com menu numerado, atualiza para o atendimento conversacional amigável
    try {
      dbInstance.prepare(`
        UPDATE bot_mensagens 
        SET mensagem = 'Fala parceiro! Seja muito bem-vindo à *{barbearia}*! 💈✂️\n\nComo posso te ajudar hoje?' 
        WHERE id = 'msg_boas_vindas' AND (mensagem LIKE '%1️⃣%' OR mensagem LIKE '%Digite o *número*%' OR mensagem LIKE '%Como podemos te ajudar hoje? Digite%')
      `).run();
    } catch (e) {}

    // Remover rodapé antigo de menu em templates existentes
    try {
      dbInstance.prepare(`
        UPDATE bot_mensagens 
        SET mensagem = REPLACE(mensagem, '\n\n_(Se quiser consultar as opções automáticas do menu a qualquer momento, basta digitar *menu*)_', '')
        WHERE mensagem LIKE '%_(Se quiser consultar as opções automáticas%'
      `).run();
    } catch (e) {}

    // Garantir templates novos dos comandos #menu e #sair
    try {
      dbInstance.prepare(`
        INSERT OR IGNORE INTO bot_mensagens (
          id, titulo, descricao, categoria, mensagem, variaveis_disponiveis, gatilho, ordem, ativo
        ) VALUES (
          'msg_menu_opcoes',
          '📋 Menu de Opções Rápido (#menu)',
          'Enviada quando o cliente solicita ver o menu completo (#menu)',
          'MENU',
          '💈 *Menu de Atendimento - {barbearia}* 💈\n\nEscolha o que você precisa ou digite livremente sua dúvida:\n\n1️⃣ *Agendar Horário sem Fila (Booksy):*\n👉 {link_booksy}\n\n2️⃣ *Tabela de Preços & Serviços:*\nEnvie *preço* ou *serviços* para ver valores de corte, barba e químicas.\n\n3️⃣ *Planos Mensalistas VIP:*\nEnvie *planos* para conhecer nossos planos de corte semanal com desconto!\n\n4️⃣ *Endereço & Localização:*\nEnvie *endereço* ou *onde fica* para receber o mapa no GPS.\n\n5️⃣ *Horários de Funcionamento:*\nEnvie *horário* para consultar nosso horário de atendimento.\n\n6️⃣ *Chave Pix Oficial:*\nEnvie *pix* para ver os dados de pagamento.\n\n7️⃣ *Consultar seus Créditos (Mensalista):*\nEnvie *saldo* para consultar seus cortes restantes no mês.\n\n8️⃣ *Falar com a Equipe Humana:*\nEnvie *atendente* ou o nome do seu barbeiro (ex: *falar com Erick*).\n\n_💡 Você não precisa digitar números, basta escrever o que deseja que te respondo na hora!_',
          '{cliente}, {barbearia}, {link_booksy}, {pix}, {horario}',
          '#menu, menu, #opcoes, #opções, opcoes, opções, #ajuda',
          19,
          1
        )
      `).run();
    } catch (e) {}

    try {
      dbInstance.prepare(`
        INSERT OR IGNORE INTO bot_mensagens (
          id, titulo, descricao, categoria, mensagem, variaveis_disponiveis, gatilho, ordem, ativo
        ) VALUES (
          'msg_robo_reativado_cliente',
          '🤖 Retomada do Robô pelo Cliente (#sair)',
          'Enviada ao cliente quando ele digita #sair para cancelar a espera do barbeiro e voltar para o robô',
          'ATENDIMENTO',
          '🤖 *Atendimento Automático Retomado!* 💈\n\nCancelei a espera pelo barbeiro e estou de volta à sua disposição!\n\nComo posso te ajudar agora? Você pode perguntar sobre agendamento, valores dos serviços, localização ou digitar *#menu* para ver opções.',
          '{cliente}, {barbearia}, {link_booksy}',
          '#sair, sair, #voltar, cancelar espera',
          20,
          1
        )
      `).run();
    } catch (e) {}
  }

  return dbInstance;
}

export function saveDb() {
  // Com o DatabaseSync nativo, todas as alterações são salvas diretamente no disco em tempo real!
}

function initSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS configuracoes (
      id TEXT PRIMARY KEY,
      nome_barbearia TEXT NOT NULL,
      endereco TEXT,
      link_google_maps TEXT,
      latitude REAL,
      longitude REAL,
      link_booksy TEXT,
      chave_pix TEXT,
      telefone_principal TEXT,
      mensagem_boas_vindas TEXT,
      horario_funcionamento TEXT,
      senha_admin TEXT DEFAULT 'admin123',
      gemini_api_key TEXT,
      gemini_ativo INTEGER DEFAULT 1,
      gemini_prompt_personalizado TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS barbeiros (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      telefone_whatsapp TEXT NOT NULL,
      email TEXT,
      tipo TEXT DEFAULT 'BARBEIRO',
      foto_url TEXT,
      ativo INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS servicos (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      categoria TEXT DEFAULT 'Geral',
      preco REAL NOT NULL,
      preco_a_partir_de INTEGER DEFAULT 0,
      duracao_minutos INTEGER DEFAULT 30,
      descricao TEXT,
      ativo INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS planos (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      preco_mensal REAL NOT NULL,
      cortes_cabelo_inclusos INTEGER NOT NULL DEFAULT 4,
      barbas_inclusas INTEGER NOT NULL DEFAULT 0,
      inclui_sobrancelha INTEGER NOT NULL DEFAULT 0,
      descricao TEXT,
      ativo INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mensalistas (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      whatsapp TEXT NOT NULL,
      plano_id TEXT,
      valor_pago REAL DEFAULT 0,
      cortes_restantes INTEGER NOT NULL DEFAULT 0,
      barbas_restantes INTEGER NOT NULL DEFAULT 0,
      sobrancelhas_restantes INTEGER NOT NULL DEFAULT 0,
      data_inicio TEXT,
      data_vencimento TEXT NOT NULL,
      status TEXT DEFAULT 'ATIVO',
      whatsapp_lid TEXT,
      observacoes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plano_id) REFERENCES planos(id)
    );

    CREATE TABLE IF NOT EXISTS historico_cortes (
      id TEXT PRIMARY KEY,
      mensalista_id TEXT NOT NULL,
      barbeiro_id TEXT,
      tipo_servico TEXT DEFAULT 'CABELO',
      data_corte DATETIME DEFAULT CURRENT_TIMESTAMP,
      observacao TEXT,
      FOREIGN KEY (mensalista_id) REFERENCES mensalistas(id)
    );

    CREATE TABLE IF NOT EXISTS bot_mensagens (
      id TEXT PRIMARY KEY,
      titulo TEXT NOT NULL,
      descricao TEXT,
      categoria TEXT DEFAULT 'GERAL',
      mensagem TEXT NOT NULL,
      variaveis_disponiveis TEXT,
      gatilho TEXT,
      ordem INTEGER DEFAULT 0,
      ativo INTEGER DEFAULT 1,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bot_mensagens_cache (
      id TEXT PRIMARY KEY,
      remote_jid TEXT,
      message_json TEXT,
      criado_em INTEGER
    );

    CREATE TABLE IF NOT EXISTS atendimentos_humanos (
      remote_jid TEXT PRIMARY KEY,
      numero TEXT,
      nome TEXT,
      motivo TEXT,
      iniciado_em TEXT,
      expira_em INTEGER
    );
  `);

  // Migrações de colunas caso antigo
  try { db.exec(`ALTER TABLE mensalistas ADD COLUMN barbas_restantes INTEGER DEFAULT 0;`); } catch (e) {}
  try { db.exec(`ALTER TABLE mensalistas ADD COLUMN sobrancelhas_restantes INTEGER DEFAULT 0;`); } catch (e) {}
  try { db.exec(`ALTER TABLE mensalistas ADD COLUMN valor_pago REAL DEFAULT 0;`); } catch (e) {}
  try { db.exec(`ALTER TABLE mensalistas ADD COLUMN data_inicio TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE mensalistas ADD COLUMN observacoes TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE mensalistas ADD COLUMN whatsapp_lid TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE mensalistas ADD COLUMN ultimo_aviso_renovacao TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE planos ADD COLUMN barbas_inclusas INTEGER DEFAULT 0;`); } catch (e) {}
  try { db.exec(`ALTER TABLE planos ADD COLUMN inclui_sobrancelha INTEGER DEFAULT 0;`); } catch (e) {}
  try { db.exec(`ALTER TABLE historico_cortes ADD COLUMN tipo_servico TEXT DEFAULT 'CABELO';`); } catch (e) {}
  try { db.exec(`ALTER TABLE barbeiros ADD COLUMN email TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE barbeiros ADD COLUMN tipo TEXT DEFAULT 'BARBEIRO';`); } catch (e) {}
  try { db.exec(`ALTER TABLE configuracoes ADD COLUMN senha_admin TEXT DEFAULT 'admin123';`); } catch (e) {}
  try { db.exec(`ALTER TABLE configuracoes ADD COLUMN link_google_maps TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE configuracoes ADD COLUMN latitude REAL;`); } catch (e) {}
  try { db.exec(`ALTER TABLE configuracoes ADD COLUMN longitude REAL;`); } catch (e) {}
  try { db.exec(`ALTER TABLE configuracoes ADD COLUMN dias_aviso_renovacao INTEGER DEFAULT 3;`); } catch (e) {}
  try { db.exec(`ALTER TABLE configuracoes ADD COLUMN aviso_renovacao_ativo INTEGER DEFAULT 1;`); } catch (e) {}
  try { db.exec(`ALTER TABLE configuracoes ADD COLUMN tempo_pausa_humano_minutos INTEGER DEFAULT 120;`); } catch (e) {}
    try { db.exec(`ALTER TABLE configuracoes ADD COLUMN robo_pausado INTEGER DEFAULT 0;`); } catch (e) {}
    try { db.exec(`ALTER TABLE configuracoes ADD COLUMN chave_licenca TEXT DEFAULT 'LIC-GM-BARBERSHOP-2026';`); } catch (e) {}
    try { db.exec(`ALTER TABLE configuracoes ADD COLUMN licenca_status TEXT DEFAULT 'ATIVO';`); } catch (e) {}
    try { db.exec(`ALTER TABLE configuracoes ADD COLUMN licenca_mensagem TEXT;`); } catch (e) {}
    try { db.exec(`ALTER TABLE configuracoes ADD COLUMN licenca_pix TEXT;`); } catch (e) {}
    try { db.exec(`ALTER TABLE configuracoes ADD COLUMN licenca_valor REAL DEFAULT 150;`); } catch (e) {}
    try { db.exec(`ALTER TABLE configuracoes ADD COLUMN licenca_vencimento TEXT;`); } catch (e) {}
    try { db.exec(`ALTER TABLE configuracoes ADD COLUMN licenca_ultimo_check TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE configuracoes ADD COLUMN gemini_api_key TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE configuracoes ADD COLUMN gemini_ativo INTEGER DEFAULT 1;`); } catch (e) {}
  try { db.exec(`ALTER TABLE configuracoes ADD COLUMN gemini_prompt_personalizado TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE bot_mensagens ADD COLUMN ordem INTEGER DEFAULT 0;`); } catch (e) {}
  try { db.exec(`ALTER TABLE bot_mensagens ADD COLUMN gatilho TEXT;`); } catch (e) {}

  // Criação de Índices de Ultra Performance (Consultas sub-milissegundo com 0% uso de CPU)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_mensalistas_whatsapp ON mensalistas(whatsapp);
    CREATE INDEX IF NOT EXISTS idx_mensalistas_status ON mensalistas(status);
    CREATE INDEX IF NOT EXISTS idx_mensalistas_vencimento ON mensalistas(data_vencimento);
    CREATE INDEX IF NOT EXISTS idx_historico_mensalista ON historico_cortes(mensalista_id);
    CREATE INDEX IF NOT EXISTS idx_historico_data ON historico_cortes(data_corte);
    CREATE INDEX IF NOT EXISTS idx_servicos_ativo ON servicos(ativo);
    CREATE INDEX IF NOT EXISTS idx_servicos_categoria ON servicos(categoria);
    CREATE INDEX IF NOT EXISTS idx_planos_ativo ON planos(ativo);
    CREATE INDEX IF NOT EXISTS idx_barbeiros_ativo ON barbeiros(ativo);
    CREATE INDEX IF NOT EXISTS idx_bot_ordem ON bot_mensagens(ordem);
    CREATE INDEX IF NOT EXISTS idx_bot_categoria ON bot_mensagens(categoria);
  `);
}

export function popularMensagensBot(db: DatabaseSync) {
  db.exec(`DELETE FROM bot_mensagens;`);

  const stmt = db.prepare(`
    INSERT INTO bot_mensagens (id, titulo, descricao, categoria, mensagem, variaveis_disponiveis, gatilho, ordem, ativo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const templates = [
    {
      id: "msg_boas_vindas",
      titulo: "👋 Boas-Vindas & Recepção Amigável",
      descricao: "Enviada automaticamente na primeira mensagem ou saudação de qualquer cliente",
      categoria: "ATENDIMENTO",
      gatilho: "oi, ola, olá, oie, opa, salve, bom dia, boa tarde, boa noite, comecar, fala, eai, e ai",
      ordem: 1,
      variaveis: "{cliente}, {barbearia}, {link_booksy}, {pix}",
      mensagem: 
`Fala parceiro! Seja muito bem-vindo à *{barbearia}*! 💈✂️

Como posso te ajudar hoje?`
    },
    {
      id: "msg_booksy",
      titulo: "1️⃣ Agendamento no Booksy (Opção 1)",
      descricao: "Enviada quando o cliente escolhe agendar ou digita a opção 1",
      categoria: "MENU",
      gatilho: "1, agendar, marcar, booksy, vaga, agenda",
      ordem: 2,
      variaveis: "{cliente}, {link_booksy}, {barbearia}, {pix}",
      mensagem: 
`Top, *{cliente}*! Para agendar sem fila e escolher seu barbeiro favorito, acesse o link oficial do nosso Booksy:

👉 *{link_booksy}*

✅ Escolha o profissional e o serviço
✅ Selecione o dia e horário que melhor se encaixam pra você
✅ Confirmação instantânea no seu celular!

🔑 *Chave Pix Oficial da Barbearia:* *{pix}*
_(Aceitamos Pix, cartões de débito/crédito e dinheiro)_

Te esperamos na cadeira da *{barbearia}*! ✂️🔥`
    },
    {
      id: "msg_servicos",
      titulo: "2️⃣ Tabela de Serviços & Plano VIP (Opção 2)",
      descricao: "Apresenta a tabela completa de serviços, químicas e o Clube VIP (Opção 2)",
      categoria: "MENU",
      gatilho: "2, servico, serviço, servicos, serviços, tabela, preço, preco, quanto custa, valor, corte, barba, quimica, química, luzes, platinado, plano, planos, vip",
      ordem: 3,
      variaveis: "{lista_planos}, {lista_servicos}, {link_booksy}, {barbearia}, {pix}",
      mensagem: 
`👑 *CLUBE DE ASSINATURA VIP - {barbearia}*
Corte o cabelo toda semana e economize até 40% no mês! Cabelo sempre na régua e vantagens exclusivas:

{lista_planos}

🔑 *Chave Pix Oficial para Assinaturas:* *{pix}*
_(Após transferir, envie o comprovante com seu nome aqui no chat)_

━━━━━━━━━━━━━━━━━━━━

📋 *TABELA COMPLETA DE SERVIÇOS AVULSOS:*

{lista_servicos}

━━━━━━━━━━━━━━━━━━━━

📲 *Agende seu horário sem fila no Booksy:*
👉 *{link_booksy}*

🔑 *Chave Pix Oficial da Barbearia:* *{pix}*`
    },
    {
      id: "msg_escolha_barbeiro",
      titulo: "3️⃣ Lista de Barbeiros da Equipe (Opção 3)",
      descricao: "Enviada quando o cliente quer falar ou agendar com um barbeiro (opção 3)",
      categoria: "MENU",
      gatilho: "3, barbeiro, equipe, profissionais, quem atende",
      ordem: 4,
      variaveis: "{lista_barbeiros}, {pix}",
      mensagem: 
`Com qual dos nossos profissionais você deseja ser atendido hoje? Digite o nome do barbeiro:

{lista_barbeiros}
👉 *Qualquer barbeiro disponível* (digite *Qualquer*)

Assim que você digitar o nome dele, nós enviamos um aviso no WhatsApp particular do barbeiro na hora! 📲💈

🔑 *Chave Pix Oficial:* *{pix}*`
    },
    {
      id: "msg_consulta_mensalista",
      titulo: "4️⃣ Quantos cortes me restam? (Opção 4)",
      descricao: "Enviada quando um cliente cadastrado consulta seus créditos (opção 4)",
      categoria: "MENU",
      gatilho: "4, saldo, credito, crédito, cortes, me resta, meus cortes",
      ordem: 5,
      variaveis: "{cliente}, {plano}, {detalhes_saldo}, {vencimento}, {link_booksy}, {pix}",
      mensagem: 
`Fala *{cliente}*! Consultamos seu plano VIP aqui no sistema: 👑

📌 *Seu Plano:* {plano}
{detalhes_saldo}
📅 *Validade do seu Ciclo:* {vencimento}

Aproveite seus benefícios e agende pelo Booksy:
👉 *{link_booksy}*

🔑 *Chave Pix para Renovação do Ciclo:* *{pix}*
_(Caso queira antecipar ou renovar seus créditos, envie o Pix e o comprovante aqui!)_`
    },
    {
      id: "msg_localizacao_pix",
      titulo: "📍 Endereço, Localização & Pix (Resposta Direta)",
      descricao: "Enviada quando o cliente solicita endereço ou chave Pix",
      categoria: "AUTOMACAO",
      gatilho: "5, endereco, endereço, localizacao, localização, onde fica, maps, pix",
      ordem: 6,
      variaveis: "{endereco}, {maps}, {horario}, {pix}",
      mensagem: 
`📍 *Endereço da Barbearia:*
{endereco}

🗺️ *Link direto no Google Maps (Rota Waze/Uber):*
{maps}

⏰ *Horário de Funcionamento:*
{horario}

🔑 *Chave Pix Oficial para Pagamentos:*
*{pix}*
_(Após transferir, favor enviar o comprovante com seu nome aqui no chat)_`
    },
    {
      id: "msg_horarios",
      titulo: "🕒 Horários de Funcionamento (Resposta Direta)",
      descricao: "Enviada quando o cliente pergunta sobre dias e horários de atendimento",
      categoria: "AUTOMACAO",
      gatilho: "6, horario, horários, que horas, abre, fecha, funcionamento, aberto",
      ordem: 7,
      variaveis: "{barbearia}, {horario}, {link_booksy}",
      mensagem: 
`⏰ *Horários de Atendimento da {barbearia}:*

{horario}

💡 *Dica:* Nossos horários de maior movimento são de quinta a sábado após as 17h. Para não enfrentar fila, recomendamos agendar com antecedência pelo Booksy:

👉 *{link_booksy}*`
    },
    {
      id: "msg_atendimento_humano",
      titulo: "💬 Transferência para Atendente Humano",
      descricao: "Enviada quando o cliente solicita falar com um atendente humano",
      categoria: "AUTOMACAO",
      gatilho: "7, 9, humano, atendente, falar com pessoa, ajuda, duvida",
      ordem: 8,
      variaveis: "{cliente}, {barbearia}, {link_booksy}",
      mensagem: 
`Perfeito, *{cliente}*! Já notificamos nossa equipe na *{barbearia}*. 👨‍💼

Como nossos barbeiros podem estar em atendimento na cadeira agora, responderemos aqui em poucos minutos!

Se for sobre agendamento, você também pode marcar direto no Booksy:
👉 *{link_booksy}*`
    },
    {
      id: "msg_quimicas",
      titulo: "🧪 Químicas, Luzes & Platinado (Resposta Direta)",
      descricao: "Procedimentos químicos, descolorações e alisamentos (integrado à Tabela Completa)",
      categoria: "AUTOMACAO",
      gatilho: "quimica, química, platinado, nevou, luzes, progressiva, botox, selagem, relaxamento",
      ordem: 9,
      variaveis: "{servicos_quimica}, {link_booksy}, {barbearia}",
      mensagem: 
`⚡ *Procedimentos Químicos & Colorações da {barbearia}:*

Confira nossos procedimentos cadastrados com produtos de alta performance:

{servicos_quimica}

_⚠️ Para procedimentos químicos, recomendamos agendar com antecedência pelo Booksy:_
👉 *{link_booksy}*`
    },
    {
      id: "msg_planos_vip",
      titulo: "👑 Detalhes do Clube VIP (Resposta Direta)",
      descricao: "Apresentação dinâmica dos planos de assinatura mensal do Clube VIP",
      categoria: "AUTOMACAO",
      gatilho: "plano, planos, clube, assinatura, mensalista, mensal",
      ordem: 10,
      variaveis: "{lista_planos}, {barbearia}, {pix}, {link_booksy}",
      mensagem: 
`👑 *Conheça o Clube de Assinatura VIP da {barbearia}!*

Corte o cabelo toda semana e economize até 40% no mês! Vantagens exclusivas:

{lista_planos}

🔑 *Chave Pix Oficial para Assinaturas:* *{pix}*
_(Após transferir, envie o comprovante com seu nome aqui no chat)_`
    },
    {
      id: "msg_alerta_barbeiro",
      titulo: "🔔 Notificação Privada ao Barbeiro no WhatsApp",
      descricao: "Disparada no WhatsApp privado do barbeiro quando o cliente o seleciona",
      categoria: "AUTOMACAO",
      gatilho: "alerta_privado_barbeiro",
      ordem: 11,
      variaveis: "{nome_barbeiro}, {cliente}, {telefone_cliente}",
      mensagem: 
`🔔 *Aviso de Atendimento - {nome_barbeiro}*

O cliente *{cliente}* (Tel: *{telefone_cliente}*) acabou de solicitar atendimento com você pelo WhatsApp da barbearia!

Acesse o chat dele para dar sequência no atendimento assim que puder. 💈`
    },
    {
      id: "msg_barba_terapia",
      titulo: "🧔 Serviços & Cuidados com a Barba",
      descricao: "Enviada quando o cliente pergunta sobre serviços e tratamentos de barba",
      categoria: "AUTOMACAO",
      gatilho: "barba, fazer a barba, aparar barba, barba alinhada",
      ordem: 12,
      variaveis: "{servicos_barba}, {link_booksy}, {barbearia}",
      mensagem: 
`🧔 *Serviços de Barba Cadastrados na {barbearia}:*

{servicos_barba}

Garanta seu momento no Booksy sem fila:
👉 *{link_booksy}*`
    },
    {
      id: "msg_cortes_infantis",
      titulo: "👶 Cortes Infantis / Kids",
      descricao: "Enviada quando o cliente pergunta sobre cortes para crianças",
      categoria: "AUTOMACAO",
      gatilho: "infantil, criança, crianca, kids, filho, menino",
      ordem: 13,
      variaveis: "{link_booksy}, {barbearia}",
      mensagem: 
`👶 *Cortes Infantis / Kids na {barbearia}:*

Temos todo o cuidado, paciência e carinho para atender a garotada!
✂️ Profissionais experientes com crianças de todas as idades
🎮 Ambiente descontraído e seguro

O valor do corte segue a tabela oficial de Corte (R$ 40,00).
Reserve o horário do seu campeão pelo Booksy:
👉 *{link_booksy}*`
    },
    {
      id: "msg_pagamentos",
      titulo: "💳 Formas de Pagamento Aceitas",
      descricao: "Enviada quando o cliente pergunta sobre formas de pagamento",
      categoria: "AUTOMACAO",
      gatilho: "pagamento, cartao, cartão, dinheiro, debito, credito",
      ordem: 14,
      variaveis: "{pix}",
      mensagem: 
`💳 *Formas de Pagamento Aceitas:*

Aceitamos diversas opções para sua comodidade:
✅ Pix (chave oficial: *{pix}*)
✅ Cartões de Crédito (Visa, Mastercard, Elo, Hipercard)
✅ Cartões de Débito
✅ Dinheiro em espécie

_Pagamento feito pelo Pix? Favor enviar o comprovante com seu nome no chat!_`
    },
    {
      id: "msg_ultimo_corte",
      titulo: "⚠️ Alerta de Fim de Pacote (Último Corte)",
      descricao: "Enviada ao cliente quando ele atinge 0 cortes restantes no mês",
      categoria: "AUTOMACAO",
      gatilho: "ultimo_corte",
      ordem: 15,
      variaveis: "{cliente}, {plano}, {vencimento}, {pix}",
      mensagem: 
`Show, *{cliente}*! Seu corte foi registrado com sucesso! 💈

⚠️ *Aviso do seu Clube VIP:*
Você utilizou todos os cortes inclusos no seu *{plano}* para este ciclo.
Seu plano renova em *{vencimento}*. 

Deseja antecipar a renovação e liberar mais cortes agora mesmo?
Envie o Pix para nossa chave oficial: *{pix}* e mande o comprovante aqui!`
    },
    {
      id: "msg_lembrete_renovacao",
      titulo: "📅 Lembrete de Renovação do Clube VIP",
      descricao: "Template pronto para envio ativo de lembrete de renovação da mensalidade",
      categoria: "AUTOMACAO",
      gatilho: "lembrete_renovacao",
      ordem: 16,
      variaveis: "{cliente}, {plano}, {vencimento}, {pix}",
      mensagem: 
`Fala *{cliente}*, beleza? Passando para te lembrar que a renovação do seu plano VIP *{plano}* vence no dia *{vencimento}*. 👑

Para manter seus cortes na régua garantidos para o próximo mês sem perder seus benefícios:
🔑 Chave Pix: *{pix}*

Após transferir, só mandar o comprovante aqui pra gente atualizar seu saldo na hora! Tmj! 👊🔥`
    },
    {
      id: "msg_fora_expediente",
      titulo: "🌙 Auto-Resposta Fora do Expediente",
      descricao: "Enviada quando recebem mensagens de madrugada ou fora do horário comercial",
      categoria: "AUTOMACAO",
      gatilho: "fora_horario",
      ordem: 17,
      variaveis: "{cliente}, {barbearia}, {horario}, {link_booksy}",
      mensagem: 
`Olá *{cliente}*! Nosso atendimento presencial está fechado no momento. 🌙

⏰ Nosso horário de funcionamento é:
*{horario}*

📲 Mas você não precisa esperar abrir para garantir sua vaga! Você pode agendar seu horário 24 horas por dia pelo Booksy:
👉 *{link_booksy}*

Deixe sua mensagem que responderemos assim que abrirmos! Obrigado pela preferência! 💈`
    },
    {
      id: "msg_duvida_humano",
      titulo: "💬 Dúvida Direta do Cliente (Encaminhamento)",
      descricao: "Enviada quando o cliente faz uma pergunta direta ou ignora as opções do menu",
      categoria: "ATENDIMENTO",
      gatilho: "duvida_direta",
      ordem: 18,
      variaveis: "{cliente}, {barbearia}, {link_booksy}",
      mensagem: 
`Opa, parceiro! 💈 Recebemos sua mensagem!

Como você enviou uma dúvida ou solicitação específica, já notifiquei a equipe da *{barbearia}*. Em instantes um dos nossos barbeiros vai te responder aqui diretamente! 👨‍💼

📲 Se quiser adiantar e garantir seu horário no Booksy sem fila:
👉 *{link_booksy}*`
    },
    {
      id: "msg_menu_opcoes",
      titulo: "📋 Menu de Opções Rápido (#menu)",
      descricao: "Enviada quando o cliente solicita ver o menu completo (#menu)",
      categoria: "MENU",
      gatilho: "#menu, menu, #opcoes, #opções, opcoes, opções, #ajuda",
      ordem: 19,
      variaveis: "{cliente}, {barbearia}, {link_booksy}, {pix}, {horario}",
      mensagem: 
`💈 *Menu de Atendimento - {barbearia}* 💈

Escolha o que você precisa ou digite livremente sua dúvida:

1️⃣ *Agendar Horário sem Fila (Booksy):*
👉 {link_booksy}

2️⃣ *Tabela de Preços & Serviços:*
Envie *preço* ou *serviços* para ver valores de corte, barba e químicas.

3️⃣ *Planos Mensalistas VIP:*
Envie *planos* para conhecer nossos planos de corte semanal com desconto!

4️⃣ *Endereço & Localização:*
Envie *endereço* ou *onde fica* para receber o mapa no GPS.

5️⃣ *Horários de Funcionamento:*
Envie *horário* para consultar nosso horário de atendimento.

6️⃣ *Chave Pix Oficial:*
Envie *pix* para ver os dados de pagamento.

7️⃣ *Consultar seus Créditos (Mensalista):*
Envie *saldo* para consultar seus cortes restantes no mês.

8️⃣ *Falar com a Equipe Humana:*
Envie *atendente* ou o nome do seu barbeiro (ex: *falar com Erick*).

_💡 Você não precisa digitar números, basta escrever o que deseja que te respondo na hora!_`
    },
    {
      id: "msg_robo_reativado_cliente",
      titulo: "🤖 Retomada do Robô pelo Cliente (#sair)",
      descricao: "Enviada ao cliente quando ele digita #sair para cancelar a espera do barbeiro e voltar para o robô",
      categoria: "ATENDIMENTO",
      gatilho: "#sair, sair, #voltar, cancelar espera",
      ordem: 20,
      variaveis: "{cliente}, {barbearia}, {link_booksy}",
      mensagem: 
`🤖 *Atendimento Automático Retomado!* 💈

Cancelei a espera pelo barbeiro e estou de volta à sua disposição!

Como posso te ajudar agora? Você pode perguntar sobre agendamento, valores dos serviços, localização ou digitar *#menu* para ver opções.`
    }
  ];

  for (const t of templates) {
    stmt.run(t.id, t.titulo, t.descricao, t.categoria, t.mensagem, t.variaveis, t.gatilho, t.ordem);
  }
}

export function popularDadosIniciaisGM(db: DatabaseSync) {
  db.exec(`DELETE FROM configuracoes;`);
  db.exec(`DELETE FROM barbeiros;`);
  db.exec(`DELETE FROM servicos;`);
  db.exec(`DELETE FROM planos;`);
  db.exec(`DELETE FROM mensalistas;`);

  // Configuração Real GM Barbershop
  db.prepare(`
    INSERT INTO configuracoes (
      id, nome_barbearia, endereco, link_google_maps, latitude, longitude, link_booksy, chave_pix,
      telefone_principal, mensagem_boas_vindas, horario_funcionamento
    ) VALUES (
      'default',
      'GM Barbershop',
      'Rua Exemplo da GM, 100 - São Paulo/SP',
      'https://maps.google.com',
      -23.550520,
      -46.633308,
      'https://booksy.com',
      '11960129564',
      '(11) 96012-9564',
      'Fala guerreiro! Seja muito bem-vindo à GM Barbershop 💈 Como podemos te ajudar hoje?',
      'Terça a Sábado das 09h às 20h'
    );
  `).run();

  // Barbeiros Reais da GM
  const stmtB = db.prepare(`INSERT INTO barbeiros (id, nome, telefone_whatsapp, email, tipo, ativo) VALUES (?, ?, ?, ?, ?, 1)`);
  stmtB.run('barbeiro-gabriel', 'Gabriel (Proprietário)', '(11) 96012-9564', 'gabriel@gmbarbershop.com', 'ADMIN');
  stmtB.run('barbeiro-erick', 'Erick', '(11) 97848-5542', 'erick@gmbarbershop.com', 'BARBEIRO');

  // Serviços Reais Catalogados da GM Barbershop
  const servicosGM = [
    ['serv-corte', 'Corte', 'Cabelo', 40.00, 0, 50, 'Corte tradicional ou degradê completo com acabamento.'],
    ['serv-penteado', 'Penteado', 'Cabelo', 15.00, 0, 15, 'Finalização e penteado com produtos premium.'],
    ['serv-progressiva', 'Progressiva', 'Cabelo', 60.00, 1, 50, 'Alinhamento térmico capilar de alta durabilidade.'],
    ['serv-botox-capilar', 'Botox Capilar', 'Cabelo', 40.00, 0, 50, 'Reconstrução e redução de frizz capilar.'],
    ['serv-relaxamento', 'Relaxamento com hidratação', 'Cabelo', 30.00, 0, 30, 'Relaxamento dos fios com hidratação profunda.'],
    ['serv-corte-blindado', 'Corte Blindado', 'Cabelo', 45.00, 0, 50, 'Técnica blindada com fixação ultra resistente.'],
    ['serv-corte-blindado-colorido', 'Corte Blindado Colorido', 'Cabelo', 55.00, 0, 50, 'Corte blindado com pigmentação artística.'],
    ['serv-luzes', 'Luzes', 'Cabelo', 70.00, 0, 50, 'Mechas e reflexos claros com descoloração controlada.'],
    ['serv-coloracao', 'Coloração', 'Cabelo', 20.00, 0, 30, 'Aplicação de tintura ou tonalizante uniforme.'],
    ['serv-hidratacao', 'Hidratação Capilar', 'Cabelo', 15.00, 0, 15, 'Nutrição e brilho com máscara reparadora.'],
    ['serv-selagem', 'Selagem Capilar', 'Cabelo', 50.00, 1, 50, 'Fechamento de cutículas e brilho espelhado.'],
    ['serv-sobrancelha', 'Sobrancelha', 'Cabelo', 10.00, 0, 5, 'Alinhamento e acabamento na navalha.'],
    ['serv-platinado', 'Platinado', 'Cabelo', 160.00, 0, 50, 'Descoloração global efeito platinado / nevou.'],
    ['serv-barba', 'Barba', 'Barba', 30.00, 0, 40, 'Desenho e alinhamento completo da barba na navalha.'],
    ['serv-barba-hidratacao', 'Barba com Hidratação', 'Barba', 40.00, 0, 40, 'Barba completa + toalha quente e óleos nutritivos.'],
    ['serv-combo-corte-barba', 'Corte e Barba', 'Combos', 70.00, 0, 90, 'Combo tradicional corte + barba alinhada.'],
    ['serv-combo-corte-barba-sobrancelha', 'Corte, Barba e Sobrancelha', 'Combos', 75.00, 0, 90, 'Experiência completa de visual.'],
    ['serv-combo-corte-barba-prog-sob', 'Corte, Barba, Progressiva e Sobrancelha', 'Combos', 135.00, 0, 130, 'Combo premium completo com química e barba.'],
    ['serv-combo-corte-barba-botox-sob', 'Corte, Barba, Botox e Sobrancelha', 'Combos', 115.00, 0, 130, 'Alinhamento dos fios, barba e sobrancelha.'],
    ['serv-combo-corte-sobrancelha', 'Corte e Sobrancelha', 'Combos', 45.00, 0, 50, 'Corte completo com limpeza da sobrancelha.'],
    ['serv-combo-corte-relax-sob', 'Corte, Relaxamento e Sobrancelha', 'Combos', 75.00, 0, 50, 'Corte com química de relaxamento.'],
    ['serv-combo-corte-barba-hidr-sob', 'Corte + Barba hidratada + Sobrancelha', 'Combos', 85.00, 0, 90, 'Corte, hidratação de barba e sobrancelha.'],
    ['serv-combo-corte-prog-barba', 'Corte + Progressiva + Barba', 'Combos', 130.00, 0, 150, 'Transformação completa de cabelo e barba.'],
    ['serv-combo-corte-barba-luzes', 'Corte, Barba e Luzes', 'Combos', 140.00, 0, 150, 'Luzes no cabelo com corte e barba.'],
    ['serv-combo-corte-botox-sob', 'Corte + Botox + Sobrancelha', 'Combos', 85.00, 1, 100, 'Corte com tratamento botox capilar.'],
    ['serv-combo-corte-sob-bigode', 'Corte + Sobrancelha + Bigode', 'Combos', 50.00, 0, 50, 'Acabamento perfeito de cabelo e buço.'],
    ['serv-combo-corte-prog-matizador', 'Corte, Progressiva e Matizador', 'Combos', 110.00, 0, 100, 'Progressiva com tonalização anti-amarelamento.'],
    ['serv-depilacao-nariz', 'Depilação do nariz', 'Outros', 10.00, 0, 10, 'Limpeza higiênica rápida com cera própria.']
  ];

  const stmtS = db.prepare(`INSERT INTO servicos (id, nome, categoria, preco, preco_a_partir_de, duracao_minutos, descricao, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`);
  for (const s of servicosGM) {
    stmtS.run(...s);
  }

  // Plano VIP Real da Barbearia
  const stmtP = db.prepare(`INSERT INTO planos (id, nome, preco_mensal, cortes_cabelo_inclusos, barbas_inclusas, inclui_sobrancelha, descricao, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`);
  stmtP.run('plano-corte-semanal-gm', 'Corte Semanal GM', 130.00, 4, 0, 0, '1 corte por semana (4 cortes no mês) + 10% de desconto em produtos');
  stmtP.run('plano-vip-completo', 'VIP Completo (Cabelo & Barba)', 220.00, 4, 4, 1, 'Cortes e barbas semanais com sobrancelha inclusa');
  stmtP.run('plano-duplo-corte', 'Corte Quinzenal (2x no mês)', 75.00, 2, 0, 0, '2 cortes no mês');

  // Assinantes VIPs Iniciais Reais
  const stmtM = db.prepare(`
    INSERT INTO mensalistas (
      id, nome, whatsapp, plano_id, valor_pago, cortes_restantes, barbas_restantes, sobrancelhas_restantes, data_inicio, data_vencimento, status, observacoes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmtM.run('ass-1', 'Lucas Silva', '(11) 98888-1111', 'plano-corte-semanal-gm', 130.00, 3, 0, 0, '2026-11-02', '2026-12-02', 'ATIVO', 'Cliente antigo, prefere corte degradê navalhado.');
  stmtM.run('ass-2', 'Mateus Oliveira', '(11) 98888-2222', 'plano-vip-completo', 220.00, 2, 3, 1, '2026-11-05', '2026-12-05', 'ATIVO', 'Faz barba e cabelo.');
  stmtM.run('ass-3', 'Rafael Santos', '(11) 97777-3333', 'plano-duplo-corte', 75.00, 1, 0, 0, '2026-10-25', '2026-11-25', 'ATIVO', 'Horário de preferência: sábado de manhã.');

  popularMensagensBot(db);
}
