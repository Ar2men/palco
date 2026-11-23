// Palco's server (Cloudflare Workers):
//  - POST /            the AI analyst (Google Gemini free tier; key stored as secret GEMINI_API_KEY)
//  - POST /subscribe   save a phone's push subscription + its favourite teams
//  - POST /unsubscribe forget it
//  - POST /pending     the service worker fetches the alert texts after a (payload-less) push
//  - cron every minute: check ESPN for those teams and push start / goal / full-time alerts

// Only Palco's pages may call this. shortcut: Origin can be faked outside a browser; the per-IP limit
// and Gemini's free daily quota are the real cap. Add an access token if it ever gets abused.
const ORIGINS = ['https://ar2men.github.io', 'http://localhost:8765'];
const APP_URL = 'https://ar2men.github.io/palco/';
const MAX_BODY = 4_000_000; // room for one screenshot
// Free-tier models, best first; the next one is tried when one is overloaded (503) or out of free quota (429).
// Google Search grounding is not free on current models, so the app sends ESPN data instead.
const MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

const SYSTEM = `Eres el analista de fútbol de Palco, la app personal del usuario. Respondes en español, directo y conciso.
Tu trabajo: analizar los partidos que te pida y darle las mejores recomendaciones con probabilidades realistas.
Tus datos: cada mensaje del usuario trae <contexto> (fecha y partidos de sus ligas según ESPN, con forma reciente y momios de DraftKings en decimal) y, cuando pregunta por un partido concreto, <partido> (estadio, forma, cara a cara, momios, goleadores y alineación). No tienes acceso a internet.
- Basa todo en esos datos. Lo que no venga en ellos (lesiones, bajas, xG, córners, tarjetas): escribe "sin dato". Nunca inventes estadísticas, jugadores ni resultados.
- Primero resume los datos clave que usaste, después las probabilidades.
- Da probabilidades en %, la cuota justa (1 / probabilidad) y compárala con los momios del contexto para decir dónde hay valor. Para la probabilidad implícita de los momios quita el margen (normaliza para que sumen 100%).
- Cuando analices un partido cubre: 1X2, goles (más/menos de la línea), ambos anotan y hándicap asiático, y di cuáles mercados no puedes estimar por falta de datos.
- Cierra con una opción de bajo riesgo y una arriesgada, cada una con su probabilidad.
- Formato: tablas cortas en Markdown y un resumen de 1 o 2 líneas al final. Di "apuestas", nunca "piernas".
- Si el usuario manda una captura de pantalla (por ejemplo de Playdoit o de su boleto), lee los equipos, mercados y momios que aparecen, dilo en una tabla y analiza dónde hay valor frente a tus probabilidades.
- Son estimaciones, no garantías: nunca digas que algo se gana seguro y recuérdale apostar solo lo que puede perder.`;

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') ?? '';
    const cors = {
      'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      Vary: 'Origin',
    };
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST' || !ORIGINS.includes(origin)) return json({ error: 'forbidden' }, 403);

    const { success } = await env.LIMITER.limit({ key: req.headers.get('CF-Connecting-IP') ?? 'unknown' });
    if (!success) return json({ error: 'rate_limited' }, 429);

    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ error: 'too_large' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: 'bad_json' }, 400); }

    const path = new URL(req.url).pathname;
    if (path === '/subscribe') return json(await subscribe(env, body));
    if (path === '/unsubscribe') return json(await unsubscribe(env, body?.endpoint));
    if (path === '/pending') return json(await pending(env, body?.endpoint));
    return chat(env, body?.messages, json);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(checkMatches(env));
  },
};

/* ---------------- AI analyst ---------------- */

async function chat(env, messages, json) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 120 ||
      messages.some(m => !['user', 'assistant'].includes(m?.role)) || messages.at(-1).role !== 'user') {
    return json({ error: 'bad_messages' }, 400);
  }
  if (!env.GEMINI_API_KEY) return json({ error: 'server_key' }, 500);

  // The app keeps the chat as {role, content}; Gemini wants {role: user|model, parts}. Images become inline_data.
  const partsOf = content => typeof content === 'string' ? [{ text: content }] : (Array.isArray(content) ? content : []).map(b =>
    b?.type === 'text' ? { text: b.text } : b?.type === 'image' && /^image\/(jpeg|png|webp)$/.test(b.source?.media_type ?? '') && typeof b.source.data === 'string'
      ? { inline_data: { mime_type: b.source.media_type, data: b.source.data } } : null).filter(p => p && (p.text || p.inline_data));
  const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: partsOf(m.content) })).filter(c => c.parts.length);

  let r, data;
  for (const model of MODELS) {
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ system_instruction: { parts: [{ text: SYSTEM }] }, contents, generationConfig: { maxOutputTokens: 8192 } }),
      });
      data = await r.json().catch(() => ({}));
    } catch {
      return json({ error: 'upstream' }, 502);
    }
    if (r.ok || ![429, 500, 503].includes(r.status)) break;
  }
  if (!r.ok) {
    const status = r.status === 429 ? 429 : [400, 401, 403].includes(r.status) ? 500 : 502;
    return json({ error: r.status === 429 ? 'rate_limited' : 'upstream', message: data.error?.message?.slice(0, 200) }, status);
  }

  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts ?? []).filter(p => p.text && !p.thought).map(p => p.text).join('');
  const blocked = data.promptFeedback?.blockReason || ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST'].includes(cand?.finishReason);
  return json({
    messages: blocked ? [] : [{ role: 'assistant', content: [{ type: 'text', text }] }],
    stop_reason: blocked ? 'refusal' : cand?.finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn',
  });
}

/* ---------------- push subscriptions (KV) ---------------- */
// Keys: "subs" = list of hashes; "sub:<hash>" = { sub, teams }; "pend:<hash>" = alerts waiting to be shown;
// "state:<league>" = { eventId: "state|home-away" } as of the last check.

const hashOf = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
const validSub = s => typeof s?.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000;

async function subscribe(env, body) {
  if (!validSub(body?.sub)) return { ok: false };
  const teams = (Array.isArray(body.teams) ? body.teams : []).slice(0, 30)
    .filter(t => /^\d+$/.test(String(t?.id)) && /^[a-z0-9.]+$/.test(String(t?.lg))).map(t => ({ id: String(t.id), lg: String(t.lg), name: String(t.name ?? '').slice(0, 60) }));
  const h = await hashOf(body.sub.endpoint);
  await env.PUSH.put(`sub:${h}`, JSON.stringify({ sub: { endpoint: body.sub.endpoint }, teams }));
  const list = JSON.parse(await env.PUSH.get('subs') ?? '[]');
  if (!list.includes(h)) await env.PUSH.put('subs', JSON.stringify([...list, h].slice(-200)));
  return { ok: true, teams: teams.length };
}

async function unsubscribe(env, endpoint) {
  if (typeof endpoint !== 'string') return { ok: false };
  const h = await hashOf(endpoint);
  await env.PUSH.delete(`sub:${h}`);
  const list = JSON.parse(await env.PUSH.get('subs') ?? '[]');
  if (list.includes(h)) await env.PUSH.put('subs', JSON.stringify(list.filter(x => x !== h)));
  return { ok: true };
}

async function pending(env, endpoint) {
  if (typeof endpoint !== 'string') return { items: [] };
  const key = `pend:${await hashOf(endpoint)}`;
  const items = JSON.parse(await env.PUSH.get(key) ?? '[]');
  if (items.length) await env.PUSH.delete(key);
  return { items };
}

/* ---------------- live check (cron) ---------------- */

async function checkMatches(env) {
  const hashes = JSON.parse(await env.PUSH.get('subs') ?? '[]');
  if (!hashes.length) return;
  const subs = (await Promise.all(hashes.map(async h => ({ h, v: JSON.parse(await env.PUSH.get(`sub:${h}`) ?? 'null') })))).filter(x => x.v);
  const leagues = [...new Set(subs.flatMap(x => x.v.teams.map(t => t.lg)))];

  for (const lg of leagues) {
    const board = await fetch(`${ESPN}/${lg}/scoreboard`).then(r => r.ok ? r.json() : null).catch(() => null);
    if (!board) continue;
    const prev = JSON.parse(await env.PUSH.get(`state:${lg}`) ?? '{}');
    const next = {};
    const alerts = [];
    for (const e of board.events ?? []) {
      const c = e.competitions?.[0];
      const home = c?.competitors?.find(x => x.homeAway === 'home'), away = c?.competitors?.find(x => x.homeAway === 'away');
      if (!home || !away) continue;
      const state = e.status?.type?.state, hs = Number(home.score ?? 0), as = Number(away.score ?? 0);
      next[e.id] = `${state}|${hs}-${as}`;
      const before = prev[e.id];
      if (!before || before === next[e.id]) continue; // first sighting only records, so a restart never spams
      const [pState, pScore] = before.split('|'), [ph, pa] = pScore.split('-').map(Number);
      const hn = home.team?.shortDisplayName ?? home.team?.displayName, an = away.team?.shortDisplayName ?? away.team?.displayName;
      const line = `${hn} ${hs}–${as} ${an}`, clock = e.status?.displayClock ? ` (${e.status.displayClock})` : '';
      const base = { url: `${APP_URL}#/partido/${lg}/${e.id}`, teams: [home.team?.id, away.team?.id] };
      if (pState === 'pre' && state === 'in') alerts.push({ ...base, tag: `${e.id}-start`, title: '¡Empezó el partido!', body: `${hn} vs ${an}` });
      if (hs + as > ph + pa) alerts.push({ ...base, tag: `${e.id}-${hs}-${as}`, title: `⚽ ¡Gol de ${hs > ph ? hn : an}!`, body: line + clock });
      if (pState !== 'post' && state === 'post') alerts.push({ ...base, tag: `${e.id}-end`, title: 'Final del partido', body: line });
    }
    if (JSON.stringify(prev) !== JSON.stringify(next)) await env.PUSH.put(`state:${lg}`, JSON.stringify(next));

    for (const a of alerts) {
      for (const { h, v } of subs) {
        if (!v.teams.some(t => t.lg === lg && a.teams.includes(t.id))) continue;
        const key = `pend:${h}`;
        const list = JSON.parse(await env.PUSH.get(key) ?? '[]');
        await env.PUSH.put(key, JSON.stringify([...list, { title: a.title, body: a.body, url: a.url, tag: a.tag }].slice(-5)), { expirationTtl: 3600 });
        const status = await sendPush(env, v.sub.endpoint);
        if (status === 404 || status === 410) await unsubscribe(env, v.sub.endpoint); // the phone dropped the subscription
      }
    }
  }
}

/* ---------------- Web Push (VAPID, no payload) ---------------- */

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sendPush(env, endpoint) {
  const key = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVATE_JWK), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const enc = o => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: APP_URL })}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { TTL: '3600', Urgency: 'high', Authorization: `vapid t=${unsigned}.${b64u(sig)}, k=${env.VAPID_PUBLIC}`, 'Content-Length': '0' },
  }).catch(() => null);
  return r?.status ?? 0;
}
