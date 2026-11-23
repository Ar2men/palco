import Anthropic from '@anthropic-ai/sdk';

// Only Palco's pages may call this. shortcut: Origin can be faked outside a browser; the per-IP limit
// and the spend limit on the Anthropic account are the real cap. Add an access token if it ever gets abused.
const ORIGINS = ['https://ar2men.github.io', 'http://localhost:8765'];
const MAX_BODY = 800_000;

const SYSTEM = `Eres el analista de fútbol de Palco, la app personal del usuario. Respondes en español, directo y conciso.
Tu trabajo: analizar los partidos que te pida y darle las mejores recomendaciones con probabilidades reales.
- Antes de estimar, busca con web_search lo que importa: forma reciente, bajas y lesiones, alineación probable, tabla, xG si aparece y momios de varias casas. Primero los datos que encontraste, después las probabilidades.
- Usa solo datos de confianza media o alta. Lo que no aparezca: "sin dato". Nunca inventes estadísticas.
- Da probabilidades en %, la cuota justa (1 / probabilidad) y, si encontraste momios, di dónde hay valor.
- Cuando analices un partido cubre: 1X2, goles (más/menos), ambos anotan, hándicap asiático, y córners, tarjetas y goleador si hay datos.
- Cierra con una opción de bajo riesgo y una arriesgada, cada una con su probabilidad real.
- Formato: tablas cortas en Markdown y un resumen de 1 o 2 líneas al final. Di "apuestas", nunca "piernas".
- Son estimaciones, no garantías: nunca digas que algo se gana seguro y recuérdale apostar solo lo que puede perder.
Cada mensaje del usuario empieza con <contexto>: la fecha y los partidos de sus ligas según ESPN, en su hora local. Úsalo como punto de partida.`;

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
    let messages;
    try { ({ messages } = JSON.parse(raw)); } catch { return json({ error: 'bad_json' }, 400); }
    if (!Array.isArray(messages) || !messages.length || messages.length > 120 ||
        messages.some(m => !['user', 'assistant'].includes(m?.role)) || messages.at(-1).role !== 'user') {
      return json({ error: 'bad_messages' }, 400);
    }

    // Model, prompt and tools are fixed here, so the endpoint can't be used for anything but the analyst.
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const added = [];
    let res;
    try {
      for (let i = 0; i < 5; i++) {
        res = await client.beta.messages.create({
          model: 'claude-opus-5-5',
          max_tokens: 16000,
          output_config: { effort: 'medium' },
          // On a safety decline the API retries the request on another model by itself.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
          tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }],
          messages: [...messages, ...added],
        });
        added.push({ role: 'assistant', content: res.content }); // returned unchanged so the app can send it back
        if (res.stop_reason !== 'pause_turn') break; // long web searches pause; resending continues them
      }
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return json({ error: 'rate_limited' }, 429);
      if (err instanceof Anthropic.AuthenticationError) return json({ error: 'server_key' }, 500);
      if (err instanceof Anthropic.APIError) return json({ error: err.error?.error?.type ?? 'upstream', message: err.error?.error?.message }, 502);
      return json({ error: 'upstream' }, 502);
    }
    return json({ messages: added, stop_reason: res.stop_reason });
  },
};
