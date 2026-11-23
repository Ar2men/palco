// Pure helpers, no DOM: app.js uses them and lib.test.mjs checks them with node.

export const LEAGUES = [
  { id: 'mex.1', logo: 22, name: 'Liga MX' },
  { id: 'eng.1', logo: 23, name: 'Premier League' },
  { id: 'esp.1', logo: 15, name: 'LaLiga' },
  { id: 'uefa.champions', logo: 2, name: 'Champions League' },
  { id: 'ita.1', logo: 12, name: 'Serie A' },
  { id: 'ger.1', logo: 10, name: 'Bundesliga' },
  { id: 'fra.1', logo: 9, name: 'Ligue 1' },
  { id: 'usa.1', logo: 19, name: 'MLS' },
  { id: 'uefa.europa', logo: 2310, name: 'Europa League' },
  { id: 'concacaf.champions', logo: 2298, name: 'Concacaf Champions Cup' },
  { id: 'mex.2', logo: 2306, name: 'Liga de Expansión MX' },
  { id: 'arg.1', logo: 1, name: 'Liga Profesional Argentina' },
  { id: 'bra.1', logo: 85, name: 'Brasileirão' },
  { id: 'col.1', logo: 1543, name: 'Liga BetPlay Colombia' },
  { id: 'por.1', logo: 14, name: 'Liga Portugal' },
  { id: 'ned.1', logo: 11, name: 'Eredivisie' },
  { id: 'fifa.world', logo: 4, name: 'Copa del Mundo' },
];
export const leagueLogo = id => { const n = LEAGUES.find(l => l.id === id)?.logo; return n ? `https://a.espncdn.com/i/leaguelogos/soccer/500/${n}.png` : ''; };
export const DEFAULT_LEAGUES = ['mex.1', 'eng.1', 'esp.1', 'uefa.champions'];

const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const sameLocalDay = (iso, day) => ymd(new Date(iso)) === ymd(day);
// ESPN buckets matches by US date and only takes one date per request (ranges return 400),
// so ask for the day before and after too, then keep the user's local day.
export const datesAround = (day, before = 1, after = 1) =>
  Array.from({ length: before + after + 1 }, (_, i) => ymd(addDays(day, i - before)));

const FINAL = {
  STATUS_FULL_TIME: 'Final', STATUS_FINAL_AET: 'Final (TE)', STATUS_FINAL_PEN: 'Final (pen.)',
  STATUS_HALFTIME: 'MT', STATUS_POSTPONED: 'Aplazado', STATUS_CANCELED: 'Cancelado',
  STATUS_ABANDONED: 'Suspendido', STATUS_SUSPENDED: 'Suspendido', STATUS_DELAYED: 'Retrasado',
};
export const statusLabel = (status) =>
  FINAL[status.type.name] ?? (status.type.state === 'in' ? status.displayClock : status.type.shortDetail);

export function simplifyEvent(e) {
  const c = e.competitions[0];
  const side = h => {
    const t = c.competitors.find(x => x.homeAway === h) ?? {};
    return { id: t.team?.id, name: t.team?.shortDisplayName || t.team?.displayName || '?',
      logo: t.team?.logo || '', score: t.score ?? '', winner: !!t.winner };
  };
  return { id: e.id, date: e.date, state: e.status.type.state, label: statusLabel(e.status),
    home: side('home'), away: side('away') };
}

export const uniqueEvents = lists => [...new Map(lists.flat().map(e => [e.id, e])).values()];

// Keeps only the matches that fall on the user's local day, earliest first.
export const eventsForDay = (events, day) =>
  events.filter(e => sameLocalDay(e.date, day)).map(simplifyEvent).sort((a, b) => a.date.localeCompare(b.date));

export function simplifyStandings(d) {
  const groups = d.children?.length ? d.children : [d];
  return groups.map(g => ({
    name: g.name,
    rows: (g.standings?.entries ?? []).map(e => {
      const s = Object.fromEntries(e.stats.map(x => [x.name, x.displayValue]));
      return { team: e.team.shortDisplayName || e.team.displayName, logo: e.team.logos?.[0]?.href ?? '',
        rank: Number(s.rank) || 0, gp: s.gamesPlayed, w: s.wins, d: s.ties, l: s.losses,
        gd: s.pointDifferential, pts: s.points,
        zone: /^#[0-9a-f]{3,6}$/i.test(e.note?.color ?? '') ? e.note.color : '', zoneName: e.note?.description ?? '' };
    }).sort((a, b) => a.rank - b.rank),
  }));
}

export const moveItem = (list, i, delta) => {
  const j = i + delta;
  if (j < 0 || j >= list.length) return list;
  const a = [...list];
  [a[i], a[j]] = [a[j], a[i]];
  return a;
};

// Minimal Markdown for the AI replies: tables, headings, lists, paragraphs, **bold**.
// Escapes HTML first, so nothing in the reply can inject markup.
const escHtml = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inline = s => escHtml(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

export function md(text) {
  const out = [];
  let list = null, table = null, para = [];
  const flush = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`), (para = []);
    if (list) out.push(`<ul>${list.map(li => `<li>${inline(li)}</li>`).join('')}</ul>`), (list = null);
    if (table) {
      const [head, ...rows] = table.filter(r => !r.every(c => /^:?-+:?$/.test(c)));
      out.push(`<div class="md-table"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead>` +
        `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      table = null;
    }
  };
  for (const line of String(text).split('\n')) {
    if (/^\s*\|.*\|\s*$/.test(line)) { if (!table) flush(); (table ??= []).push(cells(line)); continue; }
    const h = line.match(/^#{1,6}\s+(.*)/);
    const li = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)/);
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flush(); out.push('<hr>'); }
    else if (h) { flush(); out.push(`<h4>${inline(h[1])}</h4>`); }
    else if (li) { if (!list) flush(); (list ??= []).push(li[1]); }
    else if (!line.trim()) flush();
    else { if (list || table) flush(); para.push(line); }
  }
  flush();
  return out.join('');
}

// Lineup on a pitch: ESPN gives position codes (RB, CD-L, CM, LF...), not coordinates.
// Rows go from goalkeeper (first) to attack (last); each row sorted left to right.
const ROW = a => a === 'G' ? 0
  : /^(R|L)?(CD|CB|B|D|WB|SW)(-[LR])?$|^[RL]WB$|^[RL]B$/.test(a) ? 1
  : /^(F|S|ST|CF|RF|LF)(-[LR])?$/.test(a) ? 5
  : /^(DM|CDM)/.test(a) ? 2 : /^AM/.test(a) ? 4 : 3;
const SIDE = a => /-L$/.test(a) ? 0.3 : /-R$/.test(a) ? 0.7 : /^L/.test(a) && a.length > 1 ? 0 : /^R/.test(a) && a.length > 1 ? 1 : 0.5;
export function pitchRows(starters) {
  const rows = [];
  for (const p of starters) (rows[ROW(p.pos ?? '')] ??= []).push(p);
  return rows.filter(Boolean).map(r => r.sort((a, b) => SIDE(a.pos ?? '') - SIDE(b.pos ?? '')));
}

// American moneyline (+135 / -150) -> decimal odds.
export const decimalOdds = ml => ml > 0 ? 1 + ml / 100 : 1 + 100 / Math.abs(ml);

// WMO weather code -> Spanish text.
export const weatherText = c => c === 0 ? 'Despejado' : c <= 2 ? 'Parcialmente nublado' : c === 3 ? 'Nublado'
  : c <= 48 ? 'Niebla' : c <= 57 ? 'Llovizna' : c <= 67 ? 'Lluvia' : c <= 77 ? 'Nieve' : c <= 82 ? 'Chubascos' : 'Tormenta';

// Geocoding returns same-name towns worldwide; keep the one in the venue's country, then the biggest.
const COUNTRY_ALIAS = { England: 'United Kingdom', Scotland: 'United Kingdom', Wales: 'United Kingdom', USA: 'United States' };
export function pickPlace(results, country) {
  const want = [country, COUNTRY_ALIAS[country]].filter(Boolean);
  const inCountry = (results ?? []).filter(r => want.includes(r.country) || want.includes(r.admin1));
  return (inCountry.length ? inCountry : results ?? []).sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0];
}

// Form string and closing odds (decimal) that the scoreboard carries for each match, for the AI context.
const ml = v => v === 'EVEN' ? 2 : v == null || v === '' || Number.isNaN(Number(v)) ? null : decimalOdds(Number(v));
export function eventExtras(e) {
  const c = e.competitions?.[0] ?? {};
  const form = Object.fromEntries((c.competitors ?? []).map(t => [t.homeAway, t.form ?? '']));
  const o = c.odds?.[0];
  const odds = o?.moneyline ? { home: ml(o.moneyline.home?.close?.odds), draw: ml(o.drawOdds?.moneyLine), away: ml(o.moneyline.away?.close?.odds), total: o.overUnder ?? null } : null;
  return { form, odds };
}

// Streaks for one team from ESPN's recent-games list (home/away ids and scores; the "score" text is winner-first).
export function teamStreaks(games, teamId) {
  const g = (games ?? []).filter(e => e.homeTeamScore != null && e.awayTeamScore != null).map(e => {
    const home = e.homeTeamId === teamId, gf = Number(home ? e.homeTeamScore : e.awayTeamScore), ga = Number(home ? e.awayTeamScore : e.homeTeamScore);
    return { gf, ga };
  });
  const n = g.length, c = f => g.filter(f).length;
  return n ? { n, won: c(x => x.gf > x.ga), drew: c(x => x.gf === x.ga), lost: c(x => x.gf < x.ga), scored: c(x => x.gf > 0),
    cleanSheet: c(x => x.ga === 0), btts: c(x => x.gf > 0 && x.ga > 0), over25: c(x => x.gf + x.ga > 2.5),
    gfAvg: g.reduce((s, x) => s + x.gf, 0) / n, gaAvg: g.reduce((s, x) => s + x.ga, 0) / n } : null;
}

// Same idea for past meetings: [{h, a}] goals.
export function h2hStreaks(scores) {
  const n = scores.length, c = f => scores.filter(f).length;
  return n ? { n, btts: c(x => x.h > 0 && x.a > 0), over25: c(x => x.h + x.a > 2.5), goalsAvg: scores.reduce((s, x) => s + x.h + x.a, 0) / n } : null;
}

// Momentum from the play-by-play: shots, shots on target, corners and goals per 15-minute block for each side.
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const WEIGHT = { 'Shot Off Target': 1, 'Shot Blocked': 1, 'Shot On Target': 2, 'Corner Awarded': 1 };
export function momentum(commentary, homeNames, awayNames) {
  const isSide = (name, names) => names.some(x => x && (norm(x) === norm(name) || norm(x).startsWith(norm(name)) || norm(name).startsWith(norm(x))));
  const bins = Array.from({ length: 6 }, () => ({ home: 0, away: 0 }));
  for (const c of commentary ?? []) {
    const type = c.play?.type?.text ?? '', w = WEIGHT[type] ?? (type.startsWith('Goal') ? 3 : 0);
    const team = c.play?.team?.displayName, secs = c.play?.clock?.value ?? c.time?.value;
    if (!w || !team || secs == null) continue;
    const side = isSide(team, homeNames) ? 'home' : isSide(team, awayNames) ? 'away' : null;
    if (side) bins[Math.min(5, Math.floor(secs / 60 / 15))][side] += w;
  }
  return bins;
}
