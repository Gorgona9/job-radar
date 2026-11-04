import { escHtml, loadConfig } from './util.js';

const RELOC_ICON = { yes: '🟢', likely: '🟡', unclear: '⚪', no: '🔴' };

async function send(text) {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chat } = process.env;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`Telegram: ${body.description}`);
}

export function telegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

function fmtSalary(s) {
  if (!s || !(s.min || s.max)) return null;
  const k = (n) => `€${Math.round(n / 1000)}k`;
  return s.min && s.max && s.min !== s.max ? `${k(s.min)}–${k(s.max)}` : k(s.min || s.max);
}

function jobBlock(j) {
  const v = j.verdict;
  const lines = [
    `${RELOC_ICON[v.relocation] || '⚪'} <b>${escHtml(j.title)}</b>`,
    `${escHtml(j.company || '?')} — ${escHtml(j.location || 'location n/a')}`,
    `Score ${v.score}/100 | relocation: ${v.relocation}${v.knownSponsor ? ' (known sponsor)' : ''} | German: ${v.german}`,
  ];
  if (v.relocation_evidence) lines.push(`<i>${escHtml(v.relocation_evidence.slice(0, 160))}</i>`);
  const sal = fmtSalary(v.salary);
  if (sal) lines.push(`💶 ${sal}${v.blueCard === 'ok' ? ' (Blue Card OK)' : v.blueCard === 'below' ? ' (below Blue Card line)' : ''}`);
  lines.push(`<a href="${escHtml(j.url)}">Open posting</a> via ${j.source}`);
  return lines.join('\n');
}

// Sends every new match, best first, split into as many messages as needed.
export async function notifyNewMatches(matches, { filteredCount = 0, errors = [] } = {}) {
  if (!telegramConfigured()) return 'Telegram not configured';
  if (!matches.length) return 'nothing new to send';
  const cfg = loadConfig();
  const sorted = [...matches].sort((a, b) => b.verdict.score - a.verdict.score);
  const header = `🚆 <b>${sorted.length} new job${sorted.length > 1 ? 's' : ''} with possible relocation</b>\n${filteredCount} others filtered out. History: ${escHtml(cfg.telegram.dashboardUrl)}`;
  const chunks = [header];
  for (const j of sorted) {
    const block = jobBlock(j);
    if ((chunks.at(-1) + '\n\n' + block).length > 3800) chunks.push(block);
    else chunks[chunks.length - 1] += '\n\n' + block;
  }
  if (errors.length) chunks.push('⚠️ Source problems:\n' + errors.map(escHtml).join('\n').slice(0, 1500));
  for (const c of chunks) {
    await send(c);
    await new Promise((r) => setTimeout(r, 1100)); // stay under Telegram's rate limit
  }
  return `sent ${chunks.length} message(s)`;
}

// `npm run test:telegram` — prints your chat id if missing, or sends a test message.
if (process.argv.includes('--test')) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) { console.log('Set TELEGRAM_BOT_TOKEN in .env first (create a bot with @BotFather).'); process.exit(1); }
  if (!process.env.TELEGRAM_CHAT_ID) {
    const body = await (await fetch(`https://api.telegram.org/bot${token}/getUpdates`)).json();
    const chats = [...new Map((body.result || []).map((u) => u.message?.chat).filter(Boolean).map((c) => [c.id, c])).values()];
    if (!chats.length) console.log('No messages yet. Open your bot in Telegram, press Start / send "hi", then run this again.');
    for (const c of chats) console.log(`TELEGRAM_CHAT_ID=${c.id}   (${c.first_name || c.title || ''} ${c.username ? '@' + c.username : ''})`);
  } else {
    await send('✅ Job radar is connected. New relocation jobs will arrive here.');
    console.log('Test message sent.');
  }
}
