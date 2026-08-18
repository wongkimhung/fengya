/// <reference types="@cloudflare/workers-types" />
// 独立 Cloudflare Worker — 通用表单接口（/api/contact + /api/quote）
//
// 背景：站点由 Cloudflare Pages（海外）与腾讯云 EdgeOne Pages（国内）双活部署，
// 两个平台都能跑纯静态，但 Pages Function 只在 Cloudflare 生效。因此把表单逻辑
// 抽成一个独立 Worker，两个站点共用同一个绝对地址，避免维护两套接口。
//
// 部署前配置（Wrangler / Dashboard）：
//   TURNSTILE_SECRET_KEY   — Turnstile 私钥（人机校验）
//   NOTIFY_URL             — 联系表单成功后的 Webhook 转发（Slack / 飞书 / 自有接口）
//   RESEND_API_KEY         — Resend 邮件服务 API Key（报价邮件）
//   RESEND_FROM_EMAIL      — Resend 已验证发件邮箱
//   QUOTE_NOTIFY_TO        — 报价通知接收邮箱
//   GOOGLE_TRANSLATE_API_KEY — Google Cloud Translation API key（后台翻译助手，可选）
//   TRANSLATE_ALLOWED_ORIGIN — 可选，限制翻译请求来源（例如 https://www.karfanjara.ge）
//   KV 绑定 "QUOTES"       — 报价记录存储（wrangler.toml 中配置）

interface Env {
  TURNSTILE_SECRET_KEY?: string;
  NOTIFY_URL?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  QUOTE_NOTIFY_TO?: string;
  GOOGLE_TRANSLATE_API_KEY?: string;
  TRANSLATE_ALLOWED_ORIGIN?: string;
  QUOTES?: KVNamespace;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', ...extra },
  });
}

async function readBody(request: Request): Promise<Record<string, any> | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** Turnstile 服务端校验；未配置 secret 时跳过 */
async function verifyTurnstile(secret: string | undefined, token: string): Promise<null | { status: number; error: string }> {
  if (!secret) return null;
  try {
    const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }).toString(),
    }).then((r) => r.json()) as { success?: boolean };
    if (!verify.success) return { status: 403, error: 'captcha failed' };
    return null;
  } catch {
    return { status: 502, error: 'captcha verify error' };
  }
}

/** 联系表单：Turnstile 校验 + Webhook 转发 */
async function handleContact(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request);
  if (!body) return json({ ok: false, error: 'invalid JSON' }, 400);

  const name = String(body.name ?? '').trim();
  const phone = String(body.phone ?? '').trim();
  const email = String(body.email ?? '').trim();
  const message = String(body.message ?? '').trim();
  const token = String(body['cf-turnstile-response'] ?? '').trim();

  if (!name || !message) {
    return json({ ok: false, error: 'missing required fields' }, 400);
  }

  const captchaErr = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, token);
  if (captchaErr) return json({ ok: false, error: captchaErr.error }, captchaErr.status);

  const payload = {
    name,
    phone,
    email,
    message,
    at: new Date().toISOString(),
    source: 'karfanjara-portal',
  };

  if (env.NOTIFY_URL) {
    try {
      await fetch(env.NOTIFY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      // 转发失败不影响前端返回成功（避免用户重复提交）
    }
  } else {
    console.log('[contact] new enquiry', payload);
  }

  return json({ ok: true });
}

/** 报价表单：Turnstile 校验 + KV 存储 + Resend 邮件通知 */
async function handleQuote(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request);
  if (!body) return json({ ok: false, error: 'invalid JSON' }, 400);

  const name = String(body.name ?? '').trim();
  const phone = String(body.phone ?? '').trim();
  const email = String(body.email ?? '').trim();
  const productType = String(body.productType ?? '').trim();
  const areaSize = String(body.areaSize ?? '').trim();
  const location = String(body.location ?? '').trim();
  const description = String(body.description ?? '').trim();
  const preferredContact = String(body.preferredContact ?? '').trim();
  const token = String(body['cf-turnstile-response'] ?? '').trim();

  if (!name || !phone || !description) {
    return json({ ok: false, error: 'missing required fields: name, phone, description' }, 400);
  }

  const captchaErr = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, token);
  if (captchaErr) return json({ ok: false, error: captchaErr.error }, captchaErr.status);

  const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const record = {
    id,
    name,
    phone,
    email: email || null,
    productType: productType || null,
    areaSize: areaSize || null,
    location: location || null,
    description,
    preferredContact: preferredContact || 'phone',
    at: new Date().toISOString(),
    source: 'karfanjara-quote',
  };

  if (env.QUOTES) {
    try {
      await env.QUOTES.put(`quote:${id}`, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 90 }); // 90天过期
    } catch (kvErr) {
      console.error('[quote] KV save failed:', kvErr);
    }
  } else {
    console.log('[quote] no KV binding, skipping storage:', record);
  }

  if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL && env.QUOTE_NOTIFY_TO) {
    try {
      const rows = [
        ['Name', name],
        ['Phone', phone],
        ['Email', email || '—'],
        ['Product Type', productType || '—'],
        ['Area Size', areaSize || '—'],
        ['Location', location || '—'],
        ['Description', description],
        ['Preferred Contact', preferredContact || 'phone'],
      ]
        .map(
          ([k, v]) =>
            `<tr><td style="padding:8px 16px;border-bottom:1px solid #eee;font-weight:600;color:#374151;width:140px">${k}</td><td style="padding:8px 16px;border-bottom:1px solid #eee;color:#4b5563">${v}</td></tr>`
        )
        .join('');

      const emailHtml = `
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px;background:#f9fafb">
<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
<div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:20px 24px">
<h1 style="margin:0;color:#fff;font-size:18px">📋 New Quote Request</h1>
<p style="margin:4px 0 0;color:#9ca3af;font-size:13px">${new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' })}</p>
</div>
<table style="width:100%;border-collapse:collapse">${rows}</table>
<div style="padding:16px 24px;background:#f9fafb;font-size:12px;color:#9ca3af">
Submitted from Karfanjara Hilux website
</div>
</div></body></html>`;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.RESEND_FROM_EMAIL,
          to: [env.QUOTE_NOTIFY_TO],
          subject: `📋 新报价需求 - ${name} (${phone})`,
          html: emailHtml,
          reply_to: email || undefined,
        }),
      });
      console.log('[quote] email sent via Resend');
    } catch (emailErr) {
      console.error('[quote] email send failed:', emailErr);
    }
  } else {
    console.log('[quote] missing email config, skipping email');
  }

  return json({ ok: true, id, message: 'Quote request received. We will contact you soon!' });
}

/** Google Cloud Translation v2 proxy. The key stays in Worker secrets, never in the browser. */
async function handleTranslate(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (env.TRANSLATE_ALLOWED_ORIGIN && origin !== env.TRANSLATE_ALLOWED_ORIGIN) {
    return json({ ok: false, error: 'origin not allowed' }, 403);
  }
  if (!env.GOOGLE_TRANSLATE_API_KEY) {
    return json({ ok: false, error: 'translation is not configured' }, 503);
  }
  const body = await readBody(request);
  if (!body) return json({ ok: false, error: 'invalid JSON' }, 400);
  const text = String(body.text ?? '').trim();
  const target = String(body.target ?? '').trim().toLowerCase();
  const source = String(body.source ?? '').trim().toLowerCase();
  if (!text || !['en', 'zh', 'es'].includes(target) || (source && !['en', 'zh', 'es'].includes(source))) {
    return json({ ok: false, error: 'text, source and target=en|zh|es are required' }, 400);
  }
  try {
    const params = new URLSearchParams({ key: env.GOOGLE_TRANSLATE_API_KEY });
    const response = await fetch(`https://translation.googleapis.com/language/translate/v2?${params}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: text, target, ...(source ? { source } : {}), format: 'text' }),
    });
    const result = await response.json() as any;
    if (!response.ok || !result?.data?.translations?.[0]?.translatedText) {
      return json({ ok: false, error: result?.error?.message || 'translation failed' }, response.status || 502);
    }
    return json({ ok: true, translatedText: result.data.translations[0].translatedText, detectedSource: result.data.translations[0].detectedSourceLanguage || source || null });
  } catch {
    return json({ ok: false, error: 'translation service unavailable' }, 502);
  }
}

export default {
  async fetch(request: Request, env: Env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    const { pathname } = new URL(request.url);
    if (request.method === 'POST' && pathname === '/api/contact') return handleContact(request, env);
    if (request.method === 'POST' && pathname === '/api/quote') return handleQuote(request, env);
    if (request.method === 'POST' && pathname === '/api/translate') return handleTranslate(request, env);
    return json({ ok: false, error: 'not found' }, 404);
  },
};
