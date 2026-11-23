// Palco's analyst server (Cloudflare Workers). Uses Google's Gemini free tier.
// The Gemini key lives here as a secret (`npx wrangler secret put GEMINI_API_KEY`), never in the app.

// Only Palco's pages may call this. shortcut: Origin can be faked outside a browser; the per-IP limit
// and Gemini's free daily quota are the real cap. Add an access token if it ever gets abused.
const ORIGINS = ['https://ar2men.github.io', 'http://localhost:8765'];
const MAX_BODY = 800_000;
// Free-tier model. Google Search grounding is not free on current models, so the app sends ESPN data instead.
const MODEL = 'gemini-3.8-flash';

const SYSTEM = `Eres el analista de fútbol de Palco, la app personal del usuario. Respondes en español, directo y conciso.
Tu trabajo: analizar los partidos que te pida y darle las mejores recomendaciones con probabilidades realistas.
Tus datos: cada mensaje del usuario trae <contexto> (fecha y partidos de sus ligas según ESPN, con forma reciente y momios de DraftKings en decimal) y, cuando pregunta por un partido concreto, <partido> (estadio, forma, cara a cara, momios, goleadores y alineación). No tienes acceso a internet.
- Basa todo en esos datos. Lo que no venga en ellos (lesiones, bajas, xG, córners, tarjetas): escribe "sin dato". Nunca inventes estadísticas, jugadores ni resultados.
- Primero resume los datos clave que usaste, después las probabilidades.
- Da probabilidades en %, la cuota justa (1 / probabilidad) y compárala con los momios del contexto para decir dónde hay valor. Para la probabilidad implícita de los momios quita el margen (normaliza para que sumen 100%).
- Cuando analices un partido cubre: 1X2, goles (más/menos de la línea), ambos anotan y hándicap asiático, y di cuáles mercados no puedes estimar por falta de datos.
- Cierra con una opción de bajo riesgo y una arriesgada, cada una con su probabilidad.
- Formato: tablas cortas en Markdown y un resumen de 1 o 2 líneas al final. Di "apuestas", nunca "piernas".
- Son estimaciones, no garantías: nunca digas que algo se gana seguro y recuérdale apostar solo lo que puede perder.`;

const textOf = content => typeof content === 'string' ? content
  : Array.isArray(content) ? content.filter(b => b?.type === 'text').map(b => b.text).join('') : '';

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
    if (!env.GEMINI_API_KEY) return json({ error: 'server_key' }, 500);

    // The app keeps the chat as {role, content}; Gemini wants {role: user|model, parts}.
    const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: textOf(m.content) }] }))
      .filter(c => c.parts[0].text);

    let r, data;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ system_instruction: { parts: [{ text: SYSTEM }] }, contents, generationConfig: { maxOutputTokens: 8192 } }),
      });
      data = await r.json().catch(() => ({}));
    } catch {
      return json({ error: 'upstream' }, 502);
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
  },
};
