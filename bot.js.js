// ══════════════════════════════════════════════════════════════════
// Grand Park Lindoia — Bot do Telegram
// Consulta o Supabase e responde indicações de fornecedores
// ══════════════════════════════════════════════════════════════════

const TelegramBot = require('node-telegram-bot-api');

// ── Configuração ──────────────────────────────────────────────────
const BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN;  // token do @BotFather
const SUPABASE_URL = process.env.SUPABASE_URL;        // ex: https://xyzxyz.supabase.co
const SUPABASE_KEY = process.env.SUPABASE_KEY;        // anon public key
const APP_URL      = process.env.APP_URL || '';       // link do app web (opcional)

if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltam variáveis de ambiente. Verifique TELEGRAM_BOT_TOKEN, SUPABASE_URL e SUPABASE_KEY.');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ── Helpers do Supabase ───────────────────────────────────────────
async function query(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    }
  });
  if (!res.ok) return null;
  return res.json();
}

async function getSuppliers() {
  return await query('suppliers?select=*,reviews(*)&order=nome.asc') || [];
}

async function getCategories() {
  const data = await query('categories?order=nome.asc');
  return data ? data.map(c => c.nome) : [];
}

// ── Formatação ────────────────────────────────────────────────────
function avgStars(reviews) {
  if (!reviews || !reviews.length) return 0;
  return reviews.reduce((a, r) => a + r.stars, 0) / reviews.length;
}

function starEmoji(avg) {
  if (avg >= 4.5) return '⭐⭐⭐⭐⭐';
  if (avg >= 3.5) return '⭐⭐⭐⭐';
  if (avg >= 2.5) return '⭐⭐⭐';
  if (avg >= 1.5) return '⭐⭐';
  return '⭐';
}

function indicoBadge(reviews) {
  if (!reviews || !reviews.length) return '';
  const sim = reviews.filter(r => r.indico === 'yes').length;
  const nao = reviews.filter(r => r.indico === 'no').length;
  return sim >= nao ? '👍 Indicado' : '👎 Não indicado';
}

function formatTel(tel) {
  const d = (tel || '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return tel;
}

function formatSupplier(s) {
  const reviews = s.reviews || [];
  const avg = avgStars(reviews);
  const ramo = s.ramo === 'Outros' && s.outros_detalhe
    ? `Outros · ${s.outros_detalhe}`
    : s.ramo;

  let msg = `🏷 *${s.nome}*\n`;
  msg += `📂 ${ramo}\n`;
  if (reviews.length > 0) {
    msg += `${starEmoji(avg)} ${avg.toFixed(1)} — ${reviews.length} avaliação${reviews.length !== 1 ? 'ões' : ''}\n`;
    msg += `${indicoBadge(reviews)}\n`;
  }
  if (s.tel) {
    const d = s.tel.replace(/\D/g, '');
    msg += `📞 ${formatTel(s.tel)}\n`;
    msg += `💬 [WhatsApp](https://wa.me/55${d})\n`;
  }
  if (s.ig) msg += `📸 [@${s.ig}](https://instagram.com/${s.ig})\n`;
  if (s.mensagem_fornecedor) msg += `\n_"${s.mensagem_fornecedor}"_\n`;
  return msg;
}

// ── Teclado de categorias ─────────────────────────────────────────
async function categoryKeyboard() {
  const cats = await getCategories();
  const buttons = cats.map(c => ([{ text: c, callback_data: `cat:${c}` }]));
  return { inline_keyboard: buttons };
}

// ── Comandos ──────────────────────────────────────────────────────

// /start e /ajuda
bot.onText(/\/(start|ajuda)/, async (msg) => {
  const texto = `🪨 *Grand Park Lindoia — Indicações de Fornecedores*

Use os comandos abaixo para consultar os fornecedores indicados pelos moradores:

/indicacoes — ver todos os fornecedores
/categoria — filtrar por categoria
/top — os mais bem avaliados
/busca [termo] — buscar por nome ou serviço
/ajuda — mostrar esta mensagem
${APP_URL ? `\n🔗 [Acesse o app completo](${APP_URL})` : ''}`;

  bot.sendMessage(msg.chat.id, texto, { parse_mode: 'Markdown' });
});

// /indicacoes — lista todos
bot.onText(/\/indicacoes/, async (msg) => {
  const suppliers = await getSuppliers();
  const ativos = suppliers.filter(s => s.status !== 'banned');

  if (!ativos.length) {
    return bot.sendMessage(msg.chat.id, 'Nenhum fornecedor cadastrado ainda.');
  }

  bot.sendMessage(msg.chat.id, `Encontrei *${ativos.length} fornecedor${ativos.length !== 1 ? 'es' : ''}*. Enviando...`, { parse_mode: 'Markdown' });

  for (const s of ativos.slice(0, 10)) { // limite de 10 para não spammar
    await bot.sendMessage(msg.chat.id, formatSupplier(s), {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  }

  if (ativos.length > 10) {
    bot.sendMessage(msg.chat.id, `_Mostrando os primeiros 10. Use /categoria ou /busca para filtrar._\n${APP_URL ? `🔗 [Ver todos no app](${APP_URL})` : ''}`, { parse_mode: 'Markdown' });
  }
});

// /categoria — escolher categoria com botões
bot.onText(/\/categoria/, async (msg) => {
  const keyboard = await categoryKeyboard();
  bot.sendMessage(msg.chat.id, '📂 Escolha uma categoria:', {
    reply_markup: keyboard
  });
});

// callback dos botões de categoria
bot.on('callback_query', async (query) => {
  if (!query.data.startsWith('cat:')) return;
  const cat = query.data.replace('cat:', '');
  bot.answerCallbackQuery(query.id);

  const suppliers = await getSuppliers();
  const filtrados = suppliers.filter(s =>
    s.status !== 'banned' && s.ramo === cat
  ).sort((a, b) => avgStars(b.reviews) - avgStars(a.reviews));

  if (!filtrados.length) {
    return bot.sendMessage(query.message.chat.id, `Nenhum fornecedor em *${cat}* ainda.`, { parse_mode: 'Markdown' });
  }

  bot.sendMessage(query.message.chat.id, `📂 *${cat}* — ${filtrados.length} fornecedor${filtrados.length !== 1 ? 'es' : ''}:`, { parse_mode: 'Markdown' });

  for (const s of filtrados) {
    await bot.sendMessage(query.message.chat.id, formatSupplier(s), {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  }
});

// /top — os mais bem avaliados
bot.onText(/\/top/, async (msg) => {
  const suppliers = await getSuppliers();
  const top = suppliers
    .filter(s => s.status !== 'banned' && (s.reviews || []).length > 0)
    .sort((a, b) => avgStars(b.reviews) - avgStars(a.reviews))
    .slice(0, 5);

  if (!top.length) {
    return bot.sendMessage(msg.chat.id, 'Nenhuma avaliação ainda.');
  }

  let texto = '🏆 *Top fornecedores do condomínio:*\n\n';
  top.forEach((s, i) => {
    const avg = avgStars(s.reviews || []);
    texto += `${i + 1}. *${s.nome}* — ${avg.toFixed(1)} ⭐ (${(s.reviews || []).length} av.)\n`;
  });
  texto += `\nUse /categoria para filtrar por tipo de serviço.`;
  if (APP_URL) texto += `\n🔗 [Ver perfis completos](${APP_URL})`;

  bot.sendMessage(msg.chat.id, texto, {
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  });
});

// /busca [termo]
bot.onText(/\/busca (.+)/, async (msg, match) => {
  const termo = match[1].toLowerCase().trim();
  const suppliers = await getSuppliers();

  const encontrados = suppliers.filter(s => {
    if (s.status === 'banned') return false;
    const haystack = [
      s.nome, s.ramo, s.outros_detalhe, s.ig, s.mensagem_fornecedor,
      ...(s.reviews || []).map(r => r.descricao)
    ].join(' ').toLowerCase();
    return haystack.includes(termo);
  });

  if (!encontrados.length) {
    return bot.sendMessage(msg.chat.id,
      `Nenhum resultado para "*${match[1]}*". Tente /categoria para navegar.`,
      { parse_mode: 'Markdown' }
    );
  }

  bot.sendMessage(msg.chat.id, `🔍 *${encontrados.length} resultado${encontrados.length !== 1 ? 's' : ''}* para "${match[1]}":`, { parse_mode: 'Markdown' });

  for (const s of encontrados.slice(0, 5)) {
    await bot.sendMessage(msg.chat.id, formatSupplier(s), {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  }
});

// /busca sem termo
bot.onText(/^\/busca$/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Use assim: /busca vidraceiro');
});

// Mensagem de texto livre (sem comando)
bot.on('message', async (msg) => {
  if (msg.text && msg.text.startsWith('/')) return; // já tratado acima
  if (!msg.text) return;

  // Tenta interpretar como busca direta
  const termo = msg.text.toLowerCase().trim();
  const suppliers = await getSuppliers();
  const encontrados = suppliers.filter(s => {
    if (s.status === 'banned') return false;
    return [s.nome, s.ramo, s.outros_detalhe || ''].join(' ').toLowerCase().includes(termo);
  });

  if (encontrados.length) {
    bot.sendMessage(msg.chat.id, `🔍 Encontrei *${encontrados.length}* para "${msg.text}":`, { parse_mode: 'Markdown' });
    for (const s of encontrados.slice(0, 3)) {
      await bot.sendMessage(msg.chat.id, formatSupplier(s), {
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });
    }
  } else {
    bot.sendMessage(msg.chat.id,
      `Não encontrei nada para "*${msg.text}*".\n\nTente /categoria ou /busca [termo].`,
      { parse_mode: 'Markdown' }
    );
  }
});

console.log('🤖 Bot do Grand Park iniciado...');
