// ══════════════════════════════════════════════════════════════════
// Grand Park Lindoia — Bot do Telegram v2
// Linguagem natural + indicação e avaliação pelo bot
// ══════════════════════════════════════════════════════════════════

const TelegramBot = require('node-telegram-bot-api');
const http = require('http');

// ── Configuração ──────────────────────────────────────────────────
const BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const APP_URL      = process.env.APP_URL || '';
const ADMIN_CHAT_ID = 1218556141; // Nessa Melo — notificações

if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltam variáveis de ambiente.');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ── Dicionário de linguagem natural ──────────────────────────────
const DICIONARIO = {
  'Elétrica':             ['elétri', 'eletri', 'tomada', 'disjuntor', 'fio', 'curto', 'luz', 'lampada', 'lâmpada', 'chuveiro elétrico', 'quadro elétrico', 'instalação elétrica'],
  'Pintura':              ['pintur', 'pintor', 'tinta', 'parede', 'pintar', 'rolar', 'massa corrida'],
  'Hidráulica':           ['hidráuli', 'hidrauli', 'torneira', 'encanamento', 'cano', 'vazamento', 'água', 'caixa dagua', 'caixa d\'água', 'bomba', 'entupido', 'entupimento'],
  'Limpeza':              ['limpeza', 'faxina', 'faxineira', 'limpar', 'diarista', 'limpador'],
  'Marmoraria':           ['mármor', 'marmor', 'granito', 'pedra', 'bancada', 'pia'],
  'Jardinagem':           ['jardim', 'jardineiro', 'planta', 'grama', 'poda', 'jardinage'],
  'Festas e Eventos':     ['festa', 'evento', 'buffet', 'decoração', 'decoraç', 'aniversário', 'casamento', 'formatura', 'churrasco'],
  'Alimentação/Delivery': ['comida', 'marmita', 'delivery', 'aliment', 'refeição', 'refeicao', 'lanche', 'pizza', 'salgado'],
  'Outros':               [],
};

function detectarCategoria(texto) {
  const lower = texto.toLowerCase();
  for (const [cat, palavras] of Object.entries(DICIONARIO)) {
    if (cat === 'Outros') continue;
    if (palavras.some(p => lower.includes(p))) return cat;
  }
  return null;
}

function detectarIntencao(texto) {
  const lower = texto.toLowerCase();
  if (/indicar|cadastrar|adicionar|registrar|novo fornecedor/.test(lower)) return 'indicar';
  if (/avaliar|nota|estrela|comentar|review/.test(lower)) return 'avaliar';
  if (/top|melhor|mais bem|recomenda/.test(lower)) return 'top';
  if (/categor|tipo|ramo|lista/.test(lower)) return 'categorias';
  if (/ajuda|como|comandos|oi|olá|ola|bom dia|boa tarde|boa noite/.test(lower)) return 'ajuda';
  return 'busca';
}

// ── Supabase ──────────────────────────────────────────────────────
async function sbQuery(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  if (!res.ok) return null;
  return res.json();
}

async function sbPost(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) return null;
  return res.json();
}

async function getSuppliers() {
  return await sbQuery('suppliers?select=*,reviews(*)&condo_id=eq.1&order=nome.asc') || [];
}

async function getCategories() {
  const data = await sbQuery('categories?condo_id=eq.1&order=nome.asc');
  return data ? data.map(c => c.nome) : Object.keys(DICIONARIO);
}

// ── Formatação ────────────────────────────────────────────────────
function avgStars(reviews) {
  if (!reviews || !reviews.length) return 0;
  return reviews.reduce((a, r) => a + r.stars, 0) / reviews.length;
}

function starsStr(avg) {
  const full = Math.round(avg);
  return '⭐'.repeat(full) + '☆'.repeat(5 - full);
}

function formatTel(tel) {
  const d = (tel || '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return tel;
}

function normalizeTel(t) {
  let d = (t || '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 10) d = d.slice(0,2) + '9' + d.slice(2);
  return d;
}

function formatSupplier(s) {
  const reviews = s.reviews || [];
  const avg = avgStars(reviews);
  const ramo = s.ramo === 'Outros' && s.outros_detalhe ? `${s.outros_detalhe}` : s.ramo;
  const indicoCount = reviews.filter(r => r.indico === 'yes').length;
  const naoCount = reviews.filter(r => r.indico === 'no').length;
  const badge = reviews.length === 0 ? '' : indicoCount >= naoCount ? '👍 Indicado' : '👎 Não indicado';

  let msg = `🏷 *${s.nome}*  ${s.tipo === 'morador' ? '🏠' : ''}\n`;
  msg += `📂 ${ramo}\n`;
  if (reviews.length > 0) {
    msg += `${starsStr(avg)} ${avg.toFixed(1)} — ${reviews.length} avaliação${reviews.length !== 1 ? 'ões' : ''}  ${badge}\n`;
  }
  if (s.tel) {
    const d = normalizeTel(s.tel);
    msg += `📞 ${formatTel(s.tel)}  [WhatsApp](https://wa.me/55${d})\n`;
  }
  if (s.ig) msg += `📸 [@${s.ig}](https://instagram.com/${s.ig})\n`;
  if (s.mensagem_fornecedor) msg += `\n_"${s.mensagem_fornecedor}"_\n`;
  return msg;
}

async function enviarLista(chatId, lista, titulo) {
  if (!lista.length) {
    return bot.sendMessage(chatId, `Nenhum resultado encontrado. Tente outra busca ou veja /categorias`);
  }
  await bot.sendMessage(chatId, titulo, { parse_mode: 'Markdown' });
  for (const s of lista.slice(0, 8)) {
    await bot.sendMessage(chatId, formatSupplier(s), {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  }
  if (lista.length > 8 && APP_URL) {
    bot.sendMessage(chatId, `_Mostrando os primeiros 8. [Ver todos no app](${APP_URL})_`, { parse_mode: 'Markdown' });
  }
}

// ── Estado de conversa (fluxo de indicação/avaliação) ─────────────
const estado = {}; // { chatId: { etapa, dados } }

function setEstado(chatId, etapa, dados = {}) {
  estado[chatId] = { etapa, dados };
}

function getEstado(chatId) {
  return estado[chatId] || null;
}

function clearEstado(chatId) {
  delete estado[chatId];
}

// ── Menu principal ─────────────────────────────────────────────────
function menuPrincipal() {
  return {
    inline_keyboard: [
      [{ text: '🔍 Buscar fornecedor', callback_data: 'menu:buscar' }, { text: '📂 Por categoria', callback_data: 'menu:categorias' }],
      [{ text: '🏆 Mais bem avaliados', callback_data: 'menu:top' }, { text: '➕ Indicar fornecedor', callback_data: 'menu:indicar' }],
    ]
  };
}

// ── /start e /ajuda ───────────────────────────────────────────────
bot.onText(/\/(start|ajuda|menu)/, async (msg) => {
  clearEstado(msg.chat.id);
  const texto = `🪨 *Grand Park Lindoia — Fornecedores*\n\nOlá! Pode me mandar uma mensagem no estilo:\n\n💬 _"preciso de um pintor"_\n💬 _"tem alguém de hidráulica?"_\n💬 _"quero indicar um fornecedor"_\n\nOu use o menu abaixo:`;
  bot.sendMessage(msg.chat.id, texto, { parse_mode: 'Markdown', reply_markup: menuPrincipal() });
});

// ── /top ──────────────────────────────────────────────────────────
bot.onText(/\/top/, async (msg) => {
  clearEstado(msg.chat.id);
  await handleTop(msg.chat.id);
});

async function handleTop(chatId) {
  const suppliers = await getSuppliers();
  const top = suppliers
    .filter(s => s.status !== 'banned' && (s.reviews || []).length > 0)
    .sort((a, b) => avgStars(b.reviews) - avgStars(a.reviews))
    .slice(0, 5);
  if (!top.length) return bot.sendMessage(chatId, 'Nenhuma avaliação ainda.');
  let texto = '🏆 *Top fornecedores do condomínio:*\n\n';
  top.forEach((s, i) => {
    const avg = avgStars(s.reviews || []);
    texto += `${i + 1}. *${s.nome}* — ${avg.toFixed(1)} ⭐ (${(s.reviews || []).length} av.)\n`;
  });
  bot.sendMessage(chatId, texto, { parse_mode: 'Markdown', reply_markup: menuPrincipal() });
}

// ── /categorias ───────────────────────────────────────────────────
bot.onText(/\/categorias?/, async (msg) => {
  clearEstado(msg.chat.id);
  await handleCategorias(msg.chat.id);
});

async function handleCategorias(chatId) {
  const cats = await getCategories();
  const buttons = cats.map(c => ([{ text: c, callback_data: `cat:${c}` }]));
  bot.sendMessage(chatId, '📂 Escolha uma categoria:', { reply_markup: { inline_keyboard: buttons } });
}

// ── Callbacks dos botões ──────────────────────────────────────────
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  bot.answerCallbackQuery(query.id);

  // Categoria
  if (query.data.startsWith('cat:')) {
    const cat = query.data.replace('cat:', '');
    const suppliers = await getSuppliers();
    const filtrados = suppliers
      .filter(s => s.status !== 'banned' && s.ramo === cat)
      .sort((a, b) => avgStars(b.reviews) - avgStars(a.reviews));
    await enviarLista(chatId, filtrados, `📂 *${cat}* — ${filtrados.length} fornecedor${filtrados.length !== 1 ? 'es' : ''}:`);
    bot.sendMessage(chatId, 'O que mais posso ajudar?', { reply_markup: menuPrincipal() });
    return;
  }

  // Menu
  switch (query.data) {
    case 'menu:buscar':
      setEstado(chatId, 'aguardando_busca');
      bot.sendMessage(chatId, '🔍 O que você está procurando? (ex: pintor, elétrica, faxina)');
      break;
    case 'menu:categorias':
      await handleCategorias(chatId);
      break;
    case 'menu:top':
      await handleTop(chatId);
      break;
    case 'menu:indicar':
      iniciarIndicacao(chatId);
      break;
    case 'indicar:sim':
      iniciarIndicacao(chatId);
      break;
    case 'indicar:nao':
      clearEstado(chatId);
      bot.sendMessage(chatId, 'Tudo bem! Se precisar, é só chamar.', { reply_markup: menuPrincipal() });
      break;
    case 'indico:sim':
      if (getEstado(chatId)) {
        estado[chatId].dados.indico = 'yes';
        pedirEstrelas(chatId);
      }
      break;
    case 'indico:nao':
      if (getEstado(chatId)) {
        estado[chatId].dados.indico = 'no';
        pedirEstrelas(chatId);
      }
      break;
  }

  // Estrelas
  if (query.data.startsWith('stars:')) {
    const stars = parseInt(query.data.replace('stars:', ''));
    if (getEstado(chatId)) {
      estado[chatId].dados.stars = stars;
      await finalizarIndicacao(chatId);
    }
  }
});

// ── Fluxo de indicação ────────────────────────────────────────────
function iniciarIndicacao(chatId) {
  setEstado(chatId, 'indicar_nome');
  bot.sendMessage(chatId, '➕ *Vamos indicar um fornecedor!*\n\nQual é o nome do fornecedor ou empresa?', { parse_mode: 'Markdown' });
}

function pedirEstrelas(chatId) {
  setEstado(chatId, 'indicar_estrelas', estado[chatId].dados);
  bot.sendMessage(chatId, '⭐ Quantas estrelas você dá?', {
    reply_markup: {
      inline_keyboard: [[
        { text: '⭐', callback_data: 'stars:1' },
        { text: '⭐⭐', callback_data: 'stars:2' },
        { text: '⭐⭐⭐', callback_data: 'stars:3' },
        { text: '⭐⭐⭐⭐', callback_data: 'stars:4' },
        { text: '⭐⭐⭐⭐⭐', callback_data: 'stars:5' },
      ]]
    }
  });
}

async function finalizarIndicacao(chatId) {
  const dados = estado[chatId].dados;
  clearEstado(chatId);

  bot.sendMessage(chatId, '⏳ Salvando indicação...');

  // Verificar duplicata por telefone
  const suppliers = await getSuppliers();
  const telNorm = normalizeTel(dados.tel || '');
  const dup = telNorm ? suppliers.find(s => normalizeTel(s.tel) === telNorm) : null;

  let supplierId;
  if (dup) {
    supplierId = dup.id;
    bot.sendMessage(chatId, `ℹ️ Este fornecedor já estava cadastrado como *${dup.nome}*. Vou adicionar sua avaliação!`, { parse_mode: 'Markdown' });
  } else {
    // Criar novo fornecedor
    const novoSupplier = await sbPost('suppliers', {
      nome: dados.nome,
      tel: telNorm || dados.tel || '',
      ramo: dados.ramo || 'Outros',
      outros_detalhe: dados.outros_detalhe || '',
      ig: dados.ig || '',
      tipo: 'externo',
      status: 'ok',
      condo_id: 1
    });
    if (!novoSupplier || !novoSupplier[0]) {
      return bot.sendMessage(chatId, '❌ Erro ao salvar. Tente novamente ou use o app.');
    }
    supplierId = novoSupplier[0].id;
  }

  // Salvar avaliação
  await sbPost('reviews', {
    supplier_id: supplierId,
    ap: `Bot · @${dados.username || 'telegram'}`,
    indico: dados.indico || 'yes',
    reason: null,
    stars: dados.stars || 5,
    descricao: dados.descricao || 'Indicado via bot do Telegram.',
    valor: '',
    photos: [],
    date: new Date().toISOString().slice(0, 10),
    condo_id: 1
  });

  bot.sendMessage(chatId,
    `✅ *Indicação salva com sucesso!*\n\n*${dados.nome}* foi cadastrado e sua avaliação registrada. Obrigado pela contribuição! 🪨`,
    { parse_mode: 'Markdown', reply_markup: menuPrincipal() }
  );

  // Notificar admin
  const indicoBadgeNotif = dados.indico === 'yes' ? '👍 Indico' : '👎 Não indico';
  const starsNotif = '⭐'.repeat(dados.stars || 5);
  await notificarAdmin(
    `🆕 *Nova indicação no Grand Park!*

` +
    `🏷 *${dados.nome}*
` +
    `📂 ${dados.ramo || 'Outros'}${dados.outros_detalhe ? ' · ' + dados.outros_detalhe : ''}
` +
    `${starsNotif} · ${indicoBadgeNotif}
` +
    (dados.descricao ? `
_"${dados.descricao}"_
` : '') +
    `
📱 Cadastrado via bot por @${dados.username || 'telegram'}` +
    (APP_URL ? `
🔗 [Ver no app](${APP_URL})` : '')
  );
}

// ── Roteador de mensagens de texto ───────────────────────────────
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const texto = msg.text.trim();
  const est = getEstado(chatId);

  // ── Fluxo de indicação em andamento ──
  if (est) {
    switch (est.etapa) {

      case 'aguardando_busca': {
        clearEstado(chatId);
        const suppliers = await getSuppliers();
        const cat = detectarCategoria(texto);
        const termo = texto.toLowerCase();
        const filtrados = suppliers.filter(s => {
          if (s.status === 'banned') return false;
          if (cat && s.ramo === cat) return true;
          return [s.nome, s.ramo, s.outros_detalhe || ''].join(' ').toLowerCase().includes(termo);
        }).sort((a, b) => avgStars(b.reviews) - avgStars(a.reviews));
        await enviarLista(chatId, filtrados, `🔍 Resultados para "*${texto}*":`);
        bot.sendMessage(chatId, 'O que mais posso ajudar?', { reply_markup: menuPrincipal() });
        break;
      }

      case 'indicar_nome':
        estado[chatId] = { etapa: 'indicar_tel', dados: { nome: texto, username: msg.from.username } };
        bot.sendMessage(chatId, `Telefone ou WhatsApp de *${texto}*? (com DDD, ex: 51 9 8765-4321)\n\nSe não souber, mande um traço: —`, { parse_mode: 'Markdown' });
        break;

      case 'indicar_tel': {
        const tel = texto === '—' ? '' : texto;
        estado[chatId] = { etapa: 'indicar_ig', dados: { ...est.dados, tel } };
        bot.sendMessage(chatId, 'Instagram do fornecedor? (sem o @)\n\nSe não souber, mande um traço: —');
        break;
      }

      case 'indicar_ig': {
        const ig = texto === '—' ? '' : texto.replace('@', '').trim();
        estado[chatId] = { etapa: 'indicar_ramo', dados: { ...est.dados, ig } };
        const cats = await getCategories();
        const buttons = cats.map(c => ([{ text: c, callback_data: `cat_indicar:${c}` }]));
        bot.sendMessage(chatId, 'Qual é o ramo de atuação?', { reply_markup: { inline_keyboard: buttons } });
        break;
      }

      case 'indicar_descricao':
        estado[chatId] = { etapa: 'indicar_indico', dados: { ...est.dados, descricao: texto } };
        bot.sendMessage(chatId, 'Você indica este fornecedor?', {
          reply_markup: {
            inline_keyboard: [[
              { text: '👍 Sim, indico!', callback_data: 'indico:sim' },
              { text: '👎 Não indico', callback_data: 'indico:nao' },
            ]]
          }
        });
        break;

      default:
        break;
    }
    return;
  }

  // ── Sem estado: interpretar linguagem natural ──
  const intencao = detectarIntencao(texto);

  if (intencao === 'ajuda') {
    const resposta = `🪨 *Grand Park Lindoia — Fornecedores*\n\nPode me mandar mensagens como:\n\n💬 _"preciso de um pintor"_\n💬 _"tem alguém de hidráulica?"_\n💬 _"quero indicar um fornecedor"_\n💬 _"melhores avaliados"_`;
    return bot.sendMessage(chatId, resposta, { parse_mode: 'Markdown', reply_markup: menuPrincipal() });
  }

  if (intencao === 'top') return handleTop(chatId);
  if (intencao === 'categorias') return handleCategorias(chatId);

  if (intencao === 'indicar') {
    return iniciarIndicacao(chatId);
  }

  if (intencao === 'avaliar') {
    const suppliers = await getSuppliers();
    const ativos = suppliers.filter(s => s.status !== 'banned');
    const buttons = ativos.map(s => ([{ text: s.nome, callback_data: `avaliar:${s.id}` }]));
    return bot.sendMessage(chatId, 'Qual fornecedor você quer avaliar?', { reply_markup: { inline_keyboard: buttons } });
  }

  // Busca por categoria ou termo livre
  const suppliers = await getSuppliers();
  const cat = detectarCategoria(texto);
  const termo = texto.toLowerCase();

  const filtrados = suppliers.filter(s => {
    if (s.status === 'banned') return false;
    if (cat && s.ramo === cat) return true;
    const haystack = [s.nome, s.ramo, s.outros_detalhe || '', s.mensagem_fornecedor || '',
      ...(s.reviews || []).map(r => r.descricao)].join(' ').toLowerCase();
    return haystack.includes(termo);
  }).sort((a, b) => avgStars(b.reviews) - avgStars(a.reviews));

  if (filtrados.length) {
    await enviarLista(chatId, filtrados, `🔍 Encontrei *${filtrados.length}* para "${texto}":`);
    bot.sendMessage(chatId, 'O que mais posso ajudar?', { reply_markup: menuPrincipal() });
  } else {
    bot.sendMessage(chatId,
      `Não encontrei nada para "*${texto}*".\n\nTente outra palavra ou escolha uma categoria:`,
      { parse_mode: 'Markdown', reply_markup: menuPrincipal() }
    );
  }
});

// ── Callback de ramo durante indicação ───────────────────────────
bot.on('callback_query', async (query) => {
  if (!query.data.startsWith('cat_indicar:')) return;
  const chatId = query.message.chat.id;
  const cat = query.data.replace('cat_indicar:', '');
  bot.answerCallbackQuery(query.id);

  const est = getEstado(chatId);
  if (!est) return;

  if (cat === 'Outros') {
    estado[chatId] = { etapa: 'indicar_outros_detalhe', dados: { ...est.dados, ramo: 'Outros' } };
    bot.sendMessage(chatId, 'Que tipo de serviço? (ex: detetização, mudança, ar-condicionado)');
  } else {
    estado[chatId] = { etapa: 'indicar_descricao', dados: { ...est.dados, ramo: cat } };
    bot.sendMessage(chatId, 'Descreva brevemente o serviço que foi realizado:');
  }
});

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const est = getEstado(chatId);
  if (!est || est.etapa !== 'indicar_outros_detalhe') return;
  estado[chatId] = { etapa: 'indicar_descricao', dados: { ...est.dados, outros_detalhe: msg.text.trim() } };
  bot.sendMessage(chatId, 'Descreva brevemente o serviço que foi realizado:');
});

// ══════════════════════════════════════
// WEBHOOK — recebe notificações do Supabase
// ══════════════════════════════════════
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'vizinhoindica2026';
const PORT = process.env.PORT || 3000;

http.createServer(async (req, res) => {
  // Verificar método e path
  if(req.method !== 'POST' || req.url !== '/webhook'){
    res.writeHead(404); res.end(); return;
  }

  // Verificar secret no header
  const secret = req.headers['x-webhook-secret'];
  if(secret !== WEBHOOK_SECRET){
    res.writeHead(401); res.end('Unauthorized'); return;
  }

  // Ler body
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const payload = JSON.parse(body);
      const record = payload.record;
      const table = payload.table;

      if(!record) { res.writeHead(200); res.end('ok'); return; }

      // Novo fornecedor cadastrado pelo app
      if(table === 'suppliers' && record.condo_id === 1){
        await notificarAdmin(
          `🆕 *Novo fornecedor no Grand Park!*

` +
          `🏷 *${record.nome}*
` +
          `📂 ${record.ramo}${record.outros_detalhe ? ' · ' + record.outros_detalhe : ''}
` +
          `📱 Cadastrado pelo app` +
          (APP_URL ? `
🔗 [Ver no app](${APP_URL})` : '')
        );
      }

      // Nova avaliação cadastrada pelo app
      if(table === 'reviews' && record.condo_id === 1){
        const stars = '⭐'.repeat(record.stars || 0);
        const indico = record.indico === 'yes' ? '👍 Indico' : (record.reason === 'fraud' ? '⚠️ Golpista' : '👎 Não indico');
        await notificarAdmin(
          `⭐ *Nova avaliação no Grand Park!*

` +
          `Por: *${record.ap || 'Morador'}*
` +
          `${stars} · ${indico}
` +
          (record.descricao ? `
_"${record.descricao}"_` : '') +
          (APP_URL ? `

🔗 [Ver no app](${APP_URL})` : '')
        );
      }

      res.writeHead(200); res.end('ok');
    } catch(e) {
      console.error('Webhook error:', e.message);
      res.writeHead(500); res.end('error');
    }
  });
}).listen(PORT, () => {
  console.log(`🌐 Webhook server rodando na porta ${PORT}`);
});

console.log('🤖 Grand Park Bot v2 iniciado...');
