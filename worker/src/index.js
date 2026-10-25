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


/* =====================  ارسال روزانهٔ محصول به کانال تلگرام  =====================
   - هر روز (Cron) یک محصولِ «هنوز ارسال‌نشده» با عکس، توضیح، سایز، دکمهٔ سفارش و هشتگ (بدون قیمت) به کانال می‌رود
   - محصول تازه (که در اجرای قبلی در سایت نبود) اولویت دارد؛ بقیه به نوبت بین دسته‌ها می‌چرخند
   - اگر محصول جدیدی نباشد چیزی ارسال نمی‌شود؛ به‌محض اضافه‌شدن محصول تازه به سایت، روز بعد ارسال از سر گرفته می‌شود
   - محصول ناموجود ارسال نمی‌شود
   - لازم: secret با نام CHANNEL_CHAT_ID (مثل @gharibii_ir) و ادمین‌بودن ربات در کانال؛ ربات همان TELEGRAM_BOT_TOKEN است */
const CH_CATS = ['girls', 'boys', 'accessories', 'crown-wand', 'bags-shoes'];
const escHtml = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const chDay = (d) => { const t = tehran(d); return t.y + '-' + t.mo + '-' + t.d; };

async function chFeed(env) {
  const site = String(env.SITE_URL || 'https://gharibii.ir').replace(/\/+$/, '');
  const r = await fetch(site + '/telegram-feed.json?t=' + Date.now(), { headers: { 'Cache-Control': 'no-cache' } });
  if (!r.ok) throw new Error('feed ' + r.status);
  const j = await r.json();
  if (!j || !Array.isArray(j.products)) throw new Error('feed invalid');
  return j;
}
async function chPostedSet(env) {
  const set = new Set(); let cursor;
  for (let i = 0; i < 20; i++) {
    const r = await env.INVOICES.list({ prefix: 'tg:p:', cursor: cursor, limit: 1000 });
    r.keys.forEach((k) => set.add(k.name.slice(5)));
    if (r.list_complete) break;
    cursor = r.cursor;
  }
  return set;
}
function chHashtags(tags) {
  const out = [], seen = new Set();
  (Array.isArray(tags) ? tags : []).forEach((t) => {
    let h = String(t || '').trim().replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_\u200c]/gu, '').replace(/^_+|_+$/g, '');
    if (h.length < 2 || h.length > 30 || seen.has(h)) return;
    seen.add(h); out.push('#' + h);
  });
  return out.slice(0, 8).join(' ');
}
function chPick(items, seen, rot) {
  const fresh = seen ? items.filter((x) => !seen.has(x.id)) : [];
  if (fresh.length) return fresh[0];
  const cats = CH_CATS.filter((c) => items.some((x) => x.cat === c));
  items.forEach((x) => { if (cats.indexOf(x.cat) < 0) cats.push(x.cat); });
  const cat = cats[rot % cats.length];
  return items.find((x) => x.cat === cat) || items[0];
}
/* توضیح: چند پاراگراف (جداشده با |||) → پاراگراف‌های تمیز؛ اگر از حد بلندتر بود در مرز پاراگراف/جمله بریده می‌شود */
function chDesc(d, max) {
  const paras = String(d || '').split('|||').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  let out = '';
  for (const para of paras) {
    const next = out ? out + '\n\n' + para : para;
    if (next.length <= max) { out = next; continue; }
    if (!out) {
      let cut = para.slice(0, max);
      const dot = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('؟ '), cut.lastIndexOf('.'));
      cut = dot > max * 0.5 ? cut.slice(0, dot + 1) : cut.slice(0, Math.max(cut.lastIndexOf(' '), 20)).replace(/[\s،,.؛:]+$/, '') + '…';
      out = cut;
    }
    break;
  }
  return out;
}
/* قطعات پست (بدون قیمت): سر = عنوان، بدنه = توضیح، پا = سایز + لینک + هشتگ */
function chParts(it) {
  const sizes = it.sz && it.sz.length <= 140 ? '📏 سایز: ' + escHtml(it.sz) + '\n' : '';
  const tags = chHashtags(it.tags);
  const head = '🛍 <b>' + escHtml(it.t) + '</b>';
  const foot = sizes + '🔗 <a href="' + escHtml(it.u) + '">مشاهده و سفارش در سایت</a>' + (tags ? '\n\n' + tags : '');
  return { head: head, foot: foot };
}
function chCaption(it, limit) {          /* یک پیام واحد (برای حالت بدون عکس یا کپشن کوتاه) */
  const x = chParts(it);
  const room = limit - x.head.length - x.foot.length - 8;
  const d = room > 60 ? chDesc(it.d, room) : '';
  return x.head + '\n\n' + (d ? escHtml(d) + '\n\n' : '') + x.foot;
}
async function chTg(env, method, body) {
  const r = await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/' + method, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  return { ok: !!j.ok, res: j.result, err: j.description || ('http ' + r.status) };
}
async function chSend(env, feed, it) {
  const chat = env.CHANNEL_CHAT_ID;
  const wa = feed.wa ? 'https://wa.me/' + feed.wa + '?text=' + encodeURIComponent('سلام، درباره‌ی «' + it.t + '» می‌خواهم سفارش بدهم.\n' + it.u) : '';
  const rows = [[{ text: '🛒 مشاهده و سفارش', url: it.u }]];
  if (wa) rows.push([{ text: '💬 سفارش در واتساپ', url: wa }]);
  const kb = { inline_keyboard: rows };
  if (it.im) {
    const full = chCaption(it, 1000);
    const needsMore = chDesc(it.d, 4000).length > chDesc(it.d, 1000 - 250).length;     /* توضیح در کپشن (حداکثر ۱۰۲۴) جا نمی‌شود؟ */
    if (!needsMore) {
      const a = await chTg(env, 'sendPhoto', { chat_id: chat, photo: it.im, caption: full, parse_mode: 'HTML', reply_markup: kb });
      if (a.ok) return { ok: true, mode: 'photo', id: a.res && a.res.message_id };
    } else {
      /* عکس با عنوان؛ بعد توضیح کامل + سایز + لینک + هشتگ در پیام بعدی (ریپلای روی همان عکس) */
      const x = chParts(it);
      const a = await chTg(env, 'sendPhoto', { chat_id: chat, photo: it.im, caption: x.head, parse_mode: 'HTML' });
      if (a.ok) {
        const room = 3900 - x.foot.length - 10;
        const d = chDesc(it.d, Math.min(room, 2200));
        const t = await chTg(env, 'sendMessage', {
          chat_id: chat, text: (d ? escHtml(d) + '\n\n' : '') + x.foot, parse_mode: 'HTML', reply_markup: kb,
          reply_parameters: { message_id: a.res && a.res.message_id, allow_sending_without_reply: true },
          link_preview_options: { is_disabled: true }
        });
        return { ok: true, mode: t.ok ? 'photo+text' : 'photo-only', id: a.res && a.res.message_id, err: t.ok ? undefined : t.err };
      }
    }
  }
  /* اگر عکس ارسال نشد (مثلاً فرمت/اندازه) یا محصول عکس ندارد: متن + پیش‌نمایش لینک (عکس صفحه) */
  const b = await chTg(env, 'sendMessage', {
    chat_id: chat, text: chCaption(it, 3900), parse_mode: 'HTML', reply_markup: kb,
    link_preview_options: { url: it.u, prefer_large_media: true, show_above_text: true }
  });
  return b.ok ? { ok: true, mode: 'text', id: b.res && b.res.message_id } : { ok: false, err: b.err };
}
/* opts: { dry: فقط نشان بده، force: حتی اگر امروز ارسال شده } */
async function channelRun(env, opts) {
  opts = opts || {};
  const now = new Date(), today = chDay(now);
  if (!env.CHANNEL_CHAT_ID && !opts.dry) return { sent: false, reason: 'missing CHANNEL_CHAT_ID' };
  if (!env.TELEGRAM_BOT_TOKEN && !opts.dry) return { sent: false, reason: 'missing TELEGRAM_BOT_TOKEN' };
  const last = await env.INVOICES.get('tg:last', { type: 'json' }).catch(() => null);
  if (!opts.dry && !opts.force && last && last.ok && last.day === today) return { sent: false, reason: 'already_sent_today' };

  const feed = await chFeed(env);
  const prevSeen = await env.INVOICES.get('tg:seen', { type: 'json' }).catch(() => null);
  const seen = Array.isArray(prevSeen) ? new Set(prevSeen) : null;     /* null = اولین اجرا: هیچ محصولی «تازه» حساب نمی‌شود */
  const posted = await chPostedSet(env);
  const all = feed.products.filter((x) => x && x.id && x.t);
  const queue = all.filter((x) => !x.oos && !posted.has(x.id));
  const stats = { total: all.length, posted: all.filter((x) => posted.has(x.id)).length, waiting: queue.length, soldOut: all.filter((x) => x.oos).length };

  if (!opts.dry) await env.INVOICES.put('tg:seen', JSON.stringify(all.map((x) => x.id)));
  if (!queue.length) {
    if (!opts.dry) {
      await env.INVOICES.put('tg:last', JSON.stringify({ at: Math.floor(now.getTime() / 1000), day: today, ok: false, reason: 'no_new' }));
      if (!(await env.INVOICES.get('tg:empty'))) {      /* فقط یک‌بار به فروشنده خبر بده */
        await env.INVOICES.put('tg:empty', '1');
        await sendTelegram(env, '📢 همهٔ محصولات سایت به کانال ارسال شده‌اند. تا محصول تازه‌ای به سایت اضافه نشود، ارسال روزانه متوقف است.');
      }
    }
    return { sent: false, reason: 'no_new', stats: stats };
  }
  const rot = Number(await env.INVOICES.get('tg:rot').catch(() => 0)) || 0;
  const it = chPick(queue, seen, rot);
  if (opts.dry) return { sent: false, dry: true, next: { id: it.id, title: it.t, cat: it.c, image: it.im, caption: chCaption(it, 3900) }, stats: stats };

  const r = await chSend(env, feed, it);
  if (!r.ok) {
    await env.INVOICES.put('tg:last', JSON.stringify({ at: Math.floor(now.getTime() / 1000), day: today, ok: false, reason: 'telegram', err: r.err, id: it.id }));
    return { sent: false, reason: 'telegram_error', err: r.err, id: it.id, stats: stats };
  }
  await env.INVOICES.put('tg:p:' + it.id, JSON.stringify({ at: Math.floor(now.getTime() / 1000), msg: r.id || 0, mode: r.mode }));
  await env.INVOICES.put('tg:rot', String(rot + 1));
  await env.INVOICES.delete('tg:empty');
  await env.INVOICES.put('tg:last', JSON.stringify({ at: Math.floor(now.getTime() / 1000), day: today, ok: true, id: it.id, title: it.t, mode: r.mode }));
  stats.posted += 1; stats.waiting -= 1;
  return { sent: true, id: it.id, title: it.t, mode: r.mode, stats: stats };
}
async function channelMarkAll(env) {
  const feed = await chFeed(env), now = Math.floor(Date.now() / 1000);
  const posted = await chPostedSet(env);
  let n = 0;
  for (const x of feed.products) {
    if (x && x.id && !posted.has(x.id)) { await env.INVOICES.put('tg:p:' + x.id, JSON.stringify({ at: now, msg: 0, mode: 'marked' })); n++; }
  }
  await env.INVOICES.put('tg:seen', JSON.stringify(feed.products.map((x) => x.id)));
  return { marked: n };
}
async function channelReset(env) {
  let n = 0, cursor;
  for (let i = 0; i < 20; i++) {
    const r = await env.INVOICES.list({ prefix: 'tg:', cursor: cursor, limit: 1000 });
    for (const k of r.keys) { await env.INVOICES.delete(k.name); n++; }
    if (r.list_complete) break;
    cursor = r.cursor;
  }
  return { deleted: n };
}
async function channelStatus(env) {
  const last = await env.INVOICES.get('tg:last', { type: 'json' }).catch(() => null);
  const posted = await chPostedSet(env);
  return { last: last, postedCount: posted.size, channelSet: !!env.CHANNEL_CHAT_ID, botSet: !!env.TELEGRAM_BOT_TOKEN };
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
      if (path === '/channel/status' && req.method === 'GET') {
        if (!authed(req, env)) return reply(req, env, { error: 'unauthorized' }, 401);
        return reply(req, env, await channelStatus(env));
      }
      if (path === '/channel/next' && req.method === 'GET') {
        if (!authed(req, env)) return reply(req, env, { error: 'unauthorized' }, 401);
        return reply(req, env, await channelRun(env, { dry: true }));
      }
      if (path === '/channel/post' && req.method === 'POST') {
        if (!authed(req, env)) return reply(req, env, { error: 'unauthorized' }, 401);
        return reply(req, env, await channelRun(env, { force: url.searchParams.get('force') === '1' }));
      }
      if (path === '/channel/mark-all' && req.method === 'POST') {
        if (!authed(req, env)) return reply(req, env, { error: 'unauthorized' }, 401);
        return reply(req, env, await channelMarkAll(env));
      }
      if (path === '/channel/reset' && req.method === 'POST') {
        if (!authed(req, env)) return reply(req, env, { error: 'unauthorized' }, 401);
        return reply(req, env, await channelReset(env));
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
    /* Cron مخصوص کانال (پیش‌فرض ۱۹:۰۰ تهران = ۱۵:۳۰ UTC). هر Cron دیگر مثل قبل گزارش‌ها را اجرا می‌کند */
    const chCron = env.CHANNEL_CRON || '30 15 * * *';
    if (event && event.cron === chCron) {
      ctx.waitUntil((async () => {
        let out;
        try { out = await channelRun(env, {}); } catch (e) { out = { sent: false, reason: 'error', err: String(e && e.message || e) }; }
        if (out.reason === 'telegram_error' || out.reason === 'error') await sendTelegram(env, '⚠️ ارسال روزانهٔ کانال انجام نشد: ' + (out.err || out.reason));
      })());
      return;
    }
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