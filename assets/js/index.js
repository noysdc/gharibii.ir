import { EmailMessage } from 'cloudflare:email';

/* Worker فاکتورهای فروشگاه غریبی کیش
   - ذخیرهٔ فاکتور در KV با کد کوتاهِ تاریخ‌دار:  050803-1432-k7q2  (سال‌ماه‌روز شمسی - ساعت‌دقیقه - ۴ حرف تصادفی)
   - تأیید/لغو پرداخت روی همان لینک (مشتری همان لینک قبلی را باز می‌کند و وضعیت تازه را می‌بیند)
   - اعلان تلگرام (و اختیاری ایمیل) برای فاکتور جدید، اعلام پرداخت مشتری و تأیید پرداخت
   - گزارش هفتگی (شنبه‌ها) و ماهانه (اول هر ماه شمسی) + گزارش دستی */

const TZ = 'Asia/Tehran';
const CODE_RE = /^\d{6}-\d{4}-[a-z2-9]{4}$/;
const TOK_RE = /^[A-Za-z0-9_-]{10,8000}$/;
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';

/* ---------- ابزارها ---------- */
function allowedOrigins(env) {
  const site = String(env.SITE_URL || '').replace(/\/+$/, '');
  const list = ['https://gharibii.ir', 'https://www.gharibii.ir', 'http://localhost:4000', 'http://127.0.0.1:4000'];
  if (site) { list.push(site); if (site.indexOf('://www.') < 0) list.push(site.replace('://', '://www.')); }
  return list;
}
function corsHeaders(req, env) {
  const origin = req.headers.get('Origin') || '';
  const h = { 'Vary': 'Origin' };
  if (origin && allowedOrigins(env).indexOf(origin) >= 0) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET,POST,PUT,OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type,X-Seller-Key';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}
function reply(req, env, data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, corsHeaders(req, env))
  });
}
function safeEq(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function authed(req, env) { return !!env.SELLER_KEY && safeEq(req.headers.get('X-Seller-Key') || '', env.SELLER_KEY); }
const num = (v) => { const n = Math.round(Number(v)); return isFinite(n) && n > 0 ? n : 0; };
const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const fa = (n) => Number(n || 0).toLocaleString('fa-IR');
const money = (n) => fa(n) + ' تومان';

/* تاریخ شمسی به وقت تهران */
function tehran(d) {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(d);
  const m = {};
  parts.forEach((p) => { m[p.type] = p.value; });
  return { y: m.year, mo: m.month, d: m.day, h: m.hour, mi: m.minute };
}
function weekdayTehran(d) { return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d); }
function faDate(sec) {
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: TZ, year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(sec * 1000));
}
function newCodeBase(d) {
  const t = tehran(d);
  return t.y.slice(-2) + t.mo + t.d + '-' + t.h + t.mi;
}
function rand4() {
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => ALPHA[x % ALPHA.length]).join('');
}

/* ---------- اعلان‌ها (تلگرام + ایمیل اختیاری) ---------- */
async function sendTelegram(env, text, dbg) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return dbg ? 'missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID' : false;
  try {
    const r = await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: text.slice(0, 4000), disable_web_page_preview: true })
    });
    if (dbg && !r.ok) { const j = await r.json().catch(() => ({})); return 'telegram: ' + (j.description || r.status); }
    return r.ok;
  } catch (e) { return dbg ? 'telegram error: ' + (e.message || e) : false; }
}
function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
async function sendEmail(env, text, dbg) {
  if (!env.EMAIL || !env.MAIL_TO) return dbg ? 'missing EMAIL binding or MAIL_TO' : false;
  const from = env.MAIL_FROM || 'noreply@gharibii.ir';
  const subject = text.split('\n')[0].slice(0, 120);
  const raw = [
    'From: Gharibii <' + from + '>',
    'To: ' + env.MAIL_TO,
    'Subject: =?UTF-8?B?' + b64(subject) + '?=',
    'Message-ID: <' + crypto.randomUUID() + '@gharibii.ir>',
    'Date: ' + new Date().toUTCString(),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(text).replace(/.{1,76}/g, '$&\r\n').trim()
  ].join('\r\n');
  try {
    await env.EMAIL.send(new EmailMessage(from, env.MAIL_TO, raw));
    return true;
  } catch (e) { return dbg ? 'email: ' + (e.message || e) : false; }
}
/* تلگرام: همهٔ اعلان‌ها. ایمیل: فقط گزارش‌ها (kind = 'report')، مگر MAIL_ALL=1 تنظیم شده باشد */
function notify(env, ctx, text, kind) {
  const mail = kind === 'report' || env.MAIL_ALL === '1';
  const job = Promise.all([sendTelegram(env, text), mail ? sendEmail(env, text) : Promise.resolve(false)]);
  if (ctx && ctx.waitUntil) ctx.waitUntil(job);
  return job;
}
const linkOf = (env, code) => String(env.SITE_URL || '').replace(/\/+$/, '') + '/f/' + code;

/* ---------- ذخیره‌سازی ---------- */
const kvKey = (code) => 'inv:' + code;
function metaOf(m) {
  return { ts: num(m.ts), exp: num(m.exp), total: num(m.total), n: num(m.n), no: clip(m.no, 40), cust: clip(m.cust, 40), paid: m.paid ? 1 : 0, pa: num(m.pa) };
}
async function getRec(env, code) { return env.INVOICES.get(kvKey(code), { type: 'json' }); }
async function putRec(env, code, rec, meta) {
  await env.INVOICES.put(kvKey(code), JSON.stringify(rec), { metadata: metaOf(meta) });
}
async function listAll(env) {
  const out = []; let cursor;
  for (let i = 0; i < 20; i++) {
    const r = await env.INVOICES.list({ prefix: 'inv:', cursor: cursor, limit: 1000 });
    r.keys.forEach((k) => { out.push({ code: k.name.slice(4), m: k.metadata || {} }); });
    if (r.list_complete) break;
    cursor = r.cursor;
  }
  return out;
}

/* ---------- گزارش‌ها ---------- */
function summarize(rows, nowSec) {
  const paid = rows.filter((r) => r.m.paid);
  const open = rows.filter((r) => !r.m.paid && r.m.exp > nowSec);
  const lost = rows.filter((r) => !r.m.paid && r.m.exp <= nowSec);
  const sum = (a) => a.reduce((s, r) => s + (r.m.total || 0), 0);
  return { n: rows.length, paid: paid.length, paidSum: sum(paid), open: open.length, openSum: sum(open), lost: lost.length, lostSum: sum(lost), allSum: sum(rows), avg: paid.length ? Math.round(sum(paid) / paid.length) : 0 };
}
function reportText(title, s) {
  const rate = s.n ? Math.round((s.paid / s.n) * 100) : 0;
  return '📊 ' + title + '\n\n' +
    '🧾 فاکتور صادرشده: ' + fa(s.n) + ' (جمع ' + money(s.allSum) + ')\n' +
    '✅ پرداخت‌شده: ' + fa(s.paid) + ' — ' + money(s.paidSum) + '\n' +
    '⏳ منتظر پرداخت: ' + fa(s.open) + ' — ' + money(s.openSum) + '\n' +
    '⌛ مهلت‌گذشته و پرداخت‌نشده: ' + fa(s.lost) + ' — ' + money(s.lostSum) + '\n' +
    '📈 نرخ تبدیل: ٪' + fa(rate) + (s.paid ? '  |  میانگین فاکتور پرداخت‌شده: ' + money(s.avg) : '');
}
async function makeReport(env, period, now) {
  const all = await listAll(env), nowSec = Math.floor(now.getTime() / 1000);
  if (period === 'month') {
    const t = tehran(now);
    let y = Number(t.y), mo = Number(t.mo) - 1;
    if (mo < 1) { mo = 12; y -= 1; }
    const prefix = String(y).slice(-2) + String(mo).padStart(2, '0');
    const rows = all.filter((r) => r.code.indexOf(prefix) === 0);
    const label = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: TZ, month: 'long', year: 'numeric' }).format(new Date(now.getTime() - 3 * 86400000));
    return reportText('گزارش ماهانه — ' + label, summarize(rows, nowSec));
  }
  const rows = all.filter((r) => (r.m.ts || 0) >= nowSec - 7 * 86400);
  return reportText('گزارش هفتگی — ' + faDate(nowSec - 7 * 86400).split(' ساعت')[0] + ' تا ' + faDate(nowSec).split(' ساعت')[0], summarize(rows, nowSec));
}

/* ---------- مسیرها ---------- */
async function readJson(req) { try { return await req.json(); } catch (e) { return null; } }

async function createInvoice(req, env, ctx) {
  const b = await readJson(req);
  if (!b || !TOK_RE.test(String(b.tok || ''))) return reply(req, env, { error: 'bad_token' }, 400);
  const now = new Date(), base = newCodeBase(now);
  let code = '';
  for (let i = 0; i < 6 && !code; i++) {
    const c = base + '-' + rand4();
    if (!(await env.INVOICES.get(kvKey(c)))) code = c;
  }
  if (!code) return reply(req, env, { error: 'busy' }, 503);
  const meta = { ts: num(b.ts) || Math.floor(now.getTime() / 1000), exp: b.exp, total: b.total, n: b.n, no: b.no, cust: b.cust, paid: 0, pa: 0 };
  await putRec(env, code, { v: 1, tok: b.tok, paid: null, rep: null }, meta);
  notify(env, ctx, '🧾 فاکتور جدید ' + clip(b.no, 40) + '\nمشتری: ' + (clip(b.cust, 40) || '—') + '\nمبلغ: ' + money(num(b.total)) + ' (' + fa(num(b.n)) + ' قلم)\n🔗 ' + linkOf(env, code));
  return reply(req, env, { code: code });
}

async function getInvoice(req, env, code) {
  const rec = await getRec(env, code);
  if (!rec) return reply(req, env, { error: 'not_found' }, 404);
  return reply(req, env, { tok: rec.tok, paid: rec.paid || null, rep: rec.rep || null });
}

async function updateInvoice(req, env, ctx, code) {
  const rec = await getRec(env, code);
  if (!rec) return reply(req, env, { error: 'not_found' }, 404);
  const b = await readJson(req);
  if (!b) return reply(req, env, { error: 'bad_body' }, 400);
  const old = await env.INVOICES.getWithMetadata(kvKey(code));
  const m = metaOf(old.metadata || {});
  const wasPaid = !!rec.paid;
  if (b.tok !== undefined) {
    if (!TOK_RE.test(String(b.tok))) return reply(req, env, { error: 'bad_token' }, 400);
    rec.tok = b.tok;
    ['exp', 'total', 'n', 'no', 'cust'].forEach((k) => { if (b[k] !== undefined) m[k] = b[k]; });
  }
  if (b.paid !== undefined) {
    rec.paid = b.paid ? { ref: clip(b.paid.ref, 40), at: num(b.paid.at) || Math.floor(Date.now() / 1000) } : null;
    m.paid = rec.paid ? 1 : 0; m.pa = rec.paid ? rec.paid.at : 0;
  }
  await putRec(env, code, rec, m);
  if (!wasPaid && rec.paid) notify(env, ctx, '✅ پرداخت تأیید شد\nفاکتور: ' + (m.no || code) + '\nمشتری: ' + (m.cust || '—') + '\nمبلغ: ' + money(m.total) + (rec.paid.ref ? '\nکد پیگیری: ' + rec.paid.ref : ''));
  if (wasPaid && !rec.paid) notify(env, ctx, '↩️ تأیید پرداخت برداشته شد\nفاکتور: ' + (m.no || code) + ' — مبلغ ' + money(m.total));
  return reply(req, env, { ok: true, paid: rec.paid || null });
}

async function reportPayment(req, env, ctx, code) {
  const rec = await getRec(env, code);
  if (!rec) return reply(req, env, { error: 'not_found' }, 404);
  if (rec.paid) return reply(req, env, { ok: true, already: true });
  const b = (await readJson(req)) || {};
  const now = Math.floor(Date.now() / 1000);
  const recent = rec.rep && now - rec.rep.at < 120;     /* جلوگیری از اسپم اعلان */
  const ref = clip(String(b.ref || '').replace(/[^\dA-Za-z]/g, ''), 40);
  rec.rep = { ref: ref, at: now };
  const old = await env.INVOICES.getWithMetadata(kvKey(code));
  await putRec(env, code, rec, old.metadata || {});
  const m = metaOf(old.metadata || {});
  if (!recent) notify(env, ctx, '💬 مشتری اعلام پرداخت کرد\nفاکتور: ' + (m.no || code) + '\nمشتری: ' + (m.cust || '—') + '\nمبلغ: ' + money(m.total) + (ref ? '\nکد پیگیری: ' + ref : '\nکد پیگیری: وارد نشده') + '\nلطفاً در پنل زرین‌پال چک و در صفحهٔ فروشنده «تأیید پرداخت» را بزنید.\n🔗 ' + linkOf(env, code));
  return reply(req, env, { ok: true });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    let path = url.pathname.replace(/^\/api(?=\/|$)/, '').replace(/\/+$/, '') || '/';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req, env) });
    try {
      if (path === '/ping' && req.method === 'GET') {
        if (!authed(req, env)) return reply(req, env, { error: 'unauthorized' }, 401);
        const tg = await sendTelegram(env, '✅ اتصال سایت غریبی به تلگرام برقرار است.', true);
        const em = await sendEmail(env, '✅ اتصال سایت غریبی به ایمیل برقرار است.', true);
        let kv = false, kvErr = '';
        try { if (env.INVOICES) { await env.INVOICES.list({ prefix: 'inv:', limit: 1 }); kv = true; } else kvErr = 'binding INVOICES missing'; } catch (e) { kvErr = String(e && e.message || e); }
        let lastCron = null;
        try { if (env.INVOICES) lastCron = await env.INVOICES.get('meta:lastcron', { type: 'json' }); } catch (e) {}
        return reply(req, env, { ok: true, telegram: tg, email: em, kv: kv, kvErr: kvErr, siteUrl: env.SITE_URL || '', lastCron: lastCron });
      }
      if (path === '/invoices' && req.method === 'POST') {
        if (!authed(req, env)) return reply(req, env, { error: 'unauthorized' }, 401);
        return await createInvoice(req, env, ctx);
      }
      if (path === '/invoices' && req.method === 'GET') {
        if (!authed(req, env)) return reply(req, env, { error: 'unauthorized' }, 401);
        const all = (await listAll(env)).slice(-50).reverse();
        return reply(req, env, { items: all.map((r) => Object.assign({ code: r.code }, r.m)) });
      }
      if (path === '/report' && req.method === 'GET') {
        if (!authed(req, env)) return reply(req, env, { error: 'unauthorized' }, 401);
        const text = await makeReport(env, url.searchParams.get('period') === 'month' ? 'month' : 'week', new Date());
        let sent = null;
        if (url.searchParams.get('send') === '1') {
          const tg = await sendTelegram(env, text, true);
          const em = await sendEmail(env, text, true);
          sent = { telegram: tg, email: em };
        }
        return reply(req, env, { text: text, sent: sent });
      }
      const m = path.match(/^\/invoices\/([^/]+)(\/report)?$/);
      if (m) {
        const code = m[1];
        if (!CODE_RE.test(code)) return reply(req, env, { error: 'bad_code' }, 400);
        if (m[2]) { if (req.method === 'POST') return await reportPayment(req, env, ctx, code); }
        else if (req.method === 'GET') return await getInvoice(req, env, code);
        else if (req.method === 'PUT') {
          if (!authed(req, env)) return reply(req, env, { error: 'unauthorized' }, 401);
          return await updateInvoice(req, env, ctx, code);
        }
      }
      return reply(req, env, { error: 'not_found' }, 404);
    } catch (e) {
      return reply(req, env, { error: 'server_error', detail: authed(req, env) ? String(e && e.message || e) : undefined }, 500);
    }
  },

  /* اجرای زمان‌بندی‌شده: شنبه → گزارش هفتگی | اول ماه شمسی → گزارش ماهانه */
  async scheduled(event, env, ctx) {
    const now = new Date(), t = tehran(now);
    const run = async () => {
      const log = { at: Math.floor(now.getTime() / 1000), cron: event && event.cron || '', day: weekdayTehran(now), pd: t.d, sent: [] };
      try {
        if (weekdayTehran(now) === 'Sat') {
          const x = await makeReport(env, 'week', now);
          log.sent.push({ week: { telegram: await sendTelegram(env, x, true), email: await sendEmail(env, x, true) } });
        }
        if (t.d === '01') {
          const x = await makeReport(env, 'month', now);
          log.sent.push({ month: { telegram: await sendTelegram(env, x, true), email: await sendEmail(env, x, true) } });
        }
      } catch (e) { log.error = String(e && e.message || e); }
      try { await env.INVOICES.put('meta:lastcron', JSON.stringify(log)); } catch (e) {}
    };
    ctx.waitUntil(run());
  }
};