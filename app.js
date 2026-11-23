import { LEAGUES, DEFAULT_LEAGUES, ymd, addDays, datesAround, uniqueEvents, eventsForDay,
  simplifyEvent, simplifyStandings, statusLabel, moveItem, md, pitchRows, decimalOdds, weatherText, pickPlace, eventExtras } from './lib.js';

// shortcut: ESPN's public API is unofficial and undocumented; if it changes, only get()/the views below need fixing.
const API = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const API_STANDINGS = 'https://site.api.espn.com/apis/v2/sports/soccer';

const $ = s => document.querySelector(s);
const main = $('#main');
const days = $('#days');

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: settings last this session */ } };

let myLeagues = load('ligas', DEFAULT_LEAGUES).filter(id => LEAGUES.some(l => l.id === id));
let h12 = load('h12', true);
let noSpoil = load('sinSpoilers', false);
let day = new Date(); // always opens on today, on purpose
let timer;

const leagueName = id => LEAGUES.find(l => l.id === id)?.name ?? id;
const fmtTime = iso => new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: h12 });
const fmtDay = d => {
  const diff = Math.round((new Date(ymd(d).replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3T12:00')) -
    new Date(ymd(new Date()).replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3T12:00'))) / 864e5);
  return { '-1': 'Ayer', 0: 'Hoy', 1: 'Mañana' }[diff] ?? d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' });
};
// Everything from the API goes through esc() before it touches innerHTML.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const img = (src, cls = 'crest') => src ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" width="22" height="22">` : `<span class="${cls}"></span>`;

// All matches of one league over several days (one request per day, in parallel).
const scoreboard = async (id, dates) =>
  uniqueEvents(await Promise.all(dates.map(d => get(`${API}/${id}/scoreboard?dates=${d}`).then(r => r.events ?? []))));

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/* ---------- views ---------- */

function matchRow(e, lg) {
  const when = e.state === 'pre' ? fmtTime(e.date) : esc(e.label);
  const score = e.state === 'pre' ? '' : `<b>${esc(e.home.score)}</b><b>${esc(e.away.score)}</b>`;
  const team = t => `<span class="team${t.winner ? ' win' : ''}">${img(t.logo)}<span>${esc(t.name)}</span></span>`;
  return `<a class="match ${e.state}" href="#/partido/${esc(lg)}/${esc(e.id)}">
    <span class="when">${when}</span>
    <span class="teams">${team(e.home)}${team(e.away)}</span>
    <span class="score spoiler">${score}</span></a>`;
}

const leagueBlock = (id, body) =>
  `<section class="league"><h2><span>${esc(leagueName(id))}</span>
    <a class="to-table" href="#/tablas/${esc(id)}">Tabla</a></h2>${body}</section>`;

function renderDays() {
  days.hidden = false;
  days.innerHTML = Array.from({ length: 15 }, (_, i) => addDays(new Date(), i - 7)).map(d =>
    `<button data-day="${ymd(d)}" aria-pressed="${ymd(d) === ymd(day)}">${esc(fmtDay(d))}</button>`).join('');
  days.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

async function viewDay(quiet) {
  renderDays();
  if (!myLeagues.length) return noLeagues();
  if (!quiet) main.innerHTML = loading();
  const res = await Promise.allSettled(myLeagues.map(id => scoreboard(id, datesAround(day))));
  let html = '', live = false;
  const empty = [];
  res.forEach((r, i) => {
    const id = myLeagues[i];
    if (r.status === 'rejected') { html += leagueBlock(id, `<p class="note">No se pudo cargar esta liga.</p>`); return; }
    const evs = eventsForDay(r.value, day);
    if (!evs.length) return empty.push(leagueName(id));
    live ||= evs.some(e => e.state === 'in');
    html += leagueBlock(id, evs.map(e => matchRow(e, id)).join(''));
  });
  main.innerHTML = html
    ? html + (empty.length ? `<p class="rest">Sin partidos este día: ${empty.map(esc).join(', ')}.</p>` : '')
    : `<div class="empty"><p>Tus ligas no juegan este día.</p><a class="btn" href="#/proximos">Ver próximos partidos</a></div>`;
  if (live) timer = setTimeout(() => !document.hidden && route(true), 30000);
}

async function viewUpcoming() {
  if (!myLeagues.length) return noLeagues();
  main.innerHTML = loading();
  const today = new Date();
  const res = await Promise.allSettled(myLeagues.map(id => scoreboard(id, datesAround(today, 0, 7))));
  const all = [];
  res.forEach((r, i) => r.status === 'fulfilled' && r.value.forEach(e => {
    const s = simplifyEvent(e);
    if (s.state !== 'post' && new Date(s.date) >= addDays(today, -1)) all.push({ ...s, lg: myLeagues[i], order: i });
  }));
  if (!all.length) {
    main.innerHTML = `<div class="empty"><p>No hay partidos de tus ligas en los próximos 7 días.</p></div>`;
    return;
  }
  const byDay = {};
  all.sort((a, b) => a.order - b.order || a.date.localeCompare(b.date))
    .forEach(e => (byDay[ymd(new Date(e.date))] ??= []).push(e));
  main.innerHTML = Object.keys(byDay).sort().map(k => {
    const d = new Date(byDay[k][0].date);
    const groups = [...new Set(byDay[k].map(e => e.lg))];
    return `<h2 class="day-title">${esc(fmtDay(d))} <small>${esc(d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' }))}</small></h2>` +
      groups.map(lg => leagueBlock(lg, byDay[k].filter(e => e.lg === lg).map(e => matchRow(e, lg)).join(''))).join('');
  }).join('');
}

async function viewTables(lg = myLeagues[0]) {
  if (!myLeagues.length) return noLeagues();
  const chips = `<div class="chips" role="tablist">${myLeagues.map(id =>
    `<a role="tab" href="#/tablas/${esc(id)}" aria-selected="${id === lg}">${esc(leagueName(id))}</a>`).join('')}</div>`;
  main.innerHTML = chips + loading();
  const groups = simplifyStandings(await get(`${API_STANDINGS}/${lg}/standings`));
  const zones = new Map();
  const body = groups.map(g => {
    g.rows.forEach(r => r.zone && zones.set(r.zone, r.zoneName));
    return `${groups.length > 1 ? `<h3 class="group">${esc(g.name)}</h3>` : ''}
    <table class="standings"><thead><tr><th>#</th><th class="l">Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>DG</th><th>Pts</th></tr></thead>
    <tbody>${g.rows.map(r => `<tr><td class="rank" style="--zone:${r.zone || 'transparent'}">${r.rank}</td>
      <td class="l"><span class="team">${img(r.logo)}<span>${esc(r.team)}</span></span></td>
      <td>${esc(r.gp)}</td><td>${esc(r.w)}</td><td>${esc(r.d)}</td><td>${esc(r.l)}</td><td>${esc(r.gd)}</td><td class="pts">${esc(r.pts)}</td></tr>`).join('')}
    </tbody></table>`;
  }).join('');
  const legend = [...zones].map(([c, n]) => `<li><i style="background:${c}"></i>${esc(n)}</li>`).join('');
  main.innerHTML = chips + (groups.some(g => g.rows.length) ? body + (legend ? `<ul class="legend">${legend}</ul>` : '')
    : `<div class="empty"><p>Esta competición todavía no tiene tabla.</p></div>`);
  main.querySelector('[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

const STATS = [
  ['possessionPct', 'Posesión %'], ['totalShots', 'Tiros'], ['shotsOnTarget', 'Tiros a puerta'],
  ['wonCorners', 'Tiros de esquina'], ['foulsCommitted', 'Faltas'], ['offsides', 'Fueras de lugar'],
  ['saves', 'Atajadas'], ['accuratePasses', 'Pases completos'], ['yellowCards', 'Amarillas'], ['redCards', 'Rojas'],
];
const KIND = { goal: 'gol', 'own-goal': 'gol', 'penalty---scored': 'gol', 'yellow-card': 'amarilla', 'red-card': 'roja', substitution: 'cambio' };

async function viewMatch(lg, id, quiet) {
  if (!quiet) main.innerHTML = loading();
  const d = await get(`${API}/${lg}/summary?event=${encodeURIComponent(id)}`);
  const comp = d.header.competitions[0];
  const side = h => comp.competitors.find(c => c.homeAway === h);
  const home = side('home'), away = side('away');
  const state = comp.status.type.state;
  const name = c => esc(c.team.shortDisplayName || c.team.displayName);
  const logo = c => c.team.logos?.[0]?.href || c.team.logo;

  const events = (d.keyEvents ?? []).filter(k => KIND[k.type?.type] || k.scoringPlay).map(k => {
    const kind = KIND[k.type.type] ?? 'gol';
    const who = (k.participants ?? []).map(p => p.athlete?.displayName);
    const text = kind === 'cambio' ? `<b>${esc(who[0])}</b> <span class="sub">por ${esc(who[1])}</span>`
      : kind === 'gol' ? `<b>${esc(who[0])}</b>${who[1] ? ` <span class="sub">asist. ${esc(who[1])}</span>` : ''}${k.type.type === 'own-goal' ? ' <span class="sub">(autogol)</span>' : ''}`
      : `<b>${esc(who[0])}</b>`;
    return `<li class="ev ${k.team?.id === home.team.id ? 'home' : 'away'} ${kind}"><span class="min">${esc(k.clock?.displayValue)}</span><i class="icon" aria-label="${kind}"></i><span class="who">${text}</span></li>`;
  }).join('');

  const box = Object.fromEntries((d.boxscore?.teams ?? []).map(t => [t.team.id, Object.fromEntries((t.statistics ?? []).map(s => [s.name, s.displayValue]))]));
  const hs = box[home.team.id] ?? {}, as = box[away.team.id] ?? {};
  const stats = STATS.filter(([k]) => hs[k] != null && as[k] != null).map(([k, label]) => {
    const a = parseFloat(hs[k]) || 0, b = parseFloat(as[k]) || 0, tot = a + b || 1;
    return `<li class="stat"><span>${esc(hs[k])}</span><span class="label">${label}</span><span>${esc(as[k])}</span>
      <span class="bar"><i style="width:${(a / tot) * 100}%"></i><i style="width:${(b / tot) * 100}%"></i></span></li>`;
  }).join('');

  // Before kickoff ESPN sends the teams without a roster list; then we show a probable XI instead.
  const rosters = (d.rosters ?? []).filter(r => r.roster?.length);
  const lineup = rosters.map(r => lineupBlock(r.team, r.formation, r.roster, 'Alineación confirmada')).join('');
  const players = rosters.map(playersTable).join('');

  const statusText = state === 'pre' ? `${fmtDay(new Date(comp.date))}, ${fmtTime(comp.date)}` : statusLabel(comp.status);
  const venue = d.gameInfo?.venue;
  const tab = matchTab.get(id) ?? (state === 'pre' ? 'previa' : 'resumen');
  const tabs = [['previa', 'Previa'], ['resumen', 'Resumen'], ['stats', 'Estadísticas'], ['jugadores', 'Jugadores'], ['alineaciones', 'Alineaciones']];
  const panel = (key, html) => `<section data-panel="${key}" ${key === tab ? '' : 'hidden'}>${html}</section>`;
  const ask = `Analiza ${home.team.displayName} vs ${away.team.displayName} (${leagueName(lg)}, ${fmtDay(new Date(comp.date))} ${fmtTime(comp.date)})`;
  main.innerHTML = `
  <article class="match-view">
    <header class="pitch">
      <button class="back" type="button" data-back aria-label="Volver">‹</button>
      <p class="comp">${esc(leagueName(lg))}</p>
      <div class="board">
        <div class="side">${img(logo(home), 'crest big')}<span>${name(home)}</span></div>
        <div class="bigscore spoiler">${state === 'pre' ? '<span class="vs">vs</span>' : `${esc(home.score)}<span>–</span>${esc(away.score)}`}</div>
        <div class="side">${img(logo(away), 'crest big')}<span>${name(away)}</span></div>
      </div>
      <p class="status ${state}">${esc(statusText)}</p>
      ${noSpoil && state !== 'pre' ? '<button class="reveal-btn" type="button">Mostrar marcador</button>' : ''}
    </header>
    <div class="seg" role="tablist" data-match="${esc(id)}">${tabs.map(([k, label]) =>
      `<button role="tab" aria-selected="${k === tab}" data-tab="${k}">${label}</button>`).join('')}</div>
    ${panel('previa', previa(d, home, away, ask))}
    ${panel('resumen', events ? `<ol class="timeline spoiler">${events}</ol>` : `<p class="note">${state === 'pre' ? 'El partido no ha empezado.' : 'Sin eventos todavía.'}</p>`)}
    ${panel('stats', stats ? `<ul class="stats spoiler">${stats}</ul>` : '<p class="note">Las estadísticas aparecen cuando empieza el partido.</p>')}
    ${panel('jugadores', players ? `<div class="spoiler">${players}</div>` : '<p class="note">Las estadísticas de cada jugador aparecen cuando empieza el partido.</p>')}
    ${panel('alineaciones', lineup || '<div data-probable><p class="note">Buscando la alineación probable…</p></div>')}
  </article>`;
  if (!lineup) probableLineups(d, [home, away]).then(html => { const el = main.querySelector('[data-probable]'); if (el) el.innerHTML = html; });
  if (venue) weatherFor(venue, comp.date).then(txt => { const el = main.querySelector('[data-weather]'); if (el && txt) el.textContent = txt; });
  if (state === 'in') timer = setTimeout(() => !document.hidden && route(true), 30000);
}

const matchTab = new Map(); // remembers the open tab per match across live refreshes
const extrasCache = new Map();
const cached = (key, fn) => { if (!extrasCache.has(key)) extrasCache.set(key, fn().catch(err => { extrasCache.delete(key); throw err; })); return extrasCache.get(key); };
// ESPN leaves out stats that don't apply (e.g. offsides for goalkeepers): default them to 0.
const PSTATS = ['totalGoals', 'goalAssists', 'totalShots', 'shotsOnTarget', 'foulsCommitted', 'foulsSuffered', 'offsides', 'yellowCards', 'redCards', 'shotsFaced', 'goalsConceded'];
const statOf = p => ({ ...Object.fromEntries(PSTATS.map(k => [k, 0])), ...Object.fromEntries((p.stats ?? []).map(s => [s.name, Number(s.value) || 0])) });
const short = a => a?.shortName || a?.displayName || '?';

function lineupBlock(team, formation, roster, label) {
  const starters = roster.filter(p => p.starter).map(p => ({ ...p, pos: p.position?.abbreviation }));
  const subs = roster.filter(p => !p.starter);
  const marks = p => { const s = statOf(p);
    return '⚽'.repeat(s.totalGoals || 0) + (s.yellowCards ? '<i class="mk y"></i>' : '') + (s.redCards ? '<i class="mk r"></i>' : '') + (p.subbedOut ? '<i class="mk out" aria-label="salió"></i>' : ''); };
  const rows = pitchRows(starters).map(r => `<div class="xi-row">${r.map(p =>
    `<div class="pl"><span class="shirt">${esc(p.jersey)}</span><span class="pname">${esc(short(p.athlete))}</span><span class="marks">${marks(p)}</span></div>`).join('')}</div>`).join('');
  return `<div class="lineup"><h3>${img(team.logo || team.logos?.[0]?.href)} ${esc(team.shortDisplayName || team.displayName)} ${formation ? `<small>${esc(formation)}</small>` : ''}</h3>
    <p class="xi-label">${esc(label)}</p><div class="xi">${rows}</div>
    ${subs.length ? `<h4>Suplentes</h4><ol>${subs.map(p => `<li><span class="num">${esc(p.jersey)}</span>${esc(p.athlete?.displayName)}
      <span class="pos">${esc(p.position?.abbreviation)}</span>${p.subbedIn ? '<i class="in" aria-label="entró"></i>' : ''}</li>`).join('')}</ol>` : ''}</div>`;
}

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const posName = a => !a ? '' : a === 'G' ? 'Portero' : /^(F|S|ST|CF|RF|LF)(-[LR])?$/.test(a) ? 'Delantero'
  : !/M/.test(a) && /(B|CD|D|SW)(-[LR])?$/.test(a) ? 'Defensa' : 'Mediocampista';

// One card per player who played, with every action written out in full; most decisive first.
function playersTable(r) {
  const played = r.roster.filter(p => p.starter || p.subbedIn).map(p => {
    const s = statOf(p), gk = p.position?.abbreviation === 'G';
    const chips = [
      s.totalGoals && `<span class="chip-s goal">⚽ ${count(s.totalGoals, 'gol', 'goles')}</span>`,
      s.goalAssists && `<span class="chip-s strong">${count(s.goalAssists, 'asistencia', 'asistencias')}</span>`,
      s.totalShots && `<span class="chip-s">${count(s.totalShots, 'tiro', 'tiros')}, ${s.shotsOnTarget} a puerta
        <span class="shotbar" aria-hidden="true"><i style="width:${Math.round(100 * s.shotsOnTarget / s.totalShots)}%"></i></span></span>`,
      gk && s.goalsConceded && `<span class="chip-s">${count(s.goalsConceded, 'gol en contra', 'goles en contra')}</span>`,
      gk && s.shotsFaced && `<span class="chip-s">${count(s.shotsFaced, 'tiro recibido', 'tiros recibidos')}</span>`,
      s.foulsCommitted && `<span class="chip-s">${count(s.foulsCommitted, 'falta cometida', 'faltas cometidas')}</span>`,
      s.foulsSuffered && `<span class="chip-s">${count(s.foulsSuffered, 'falta recibida', 'faltas recibidas')}</span>`,
      s.offsides && `<span class="chip-s">${count(s.offsides, 'fuera de lugar', 'fueras de lugar')}</span>`,
      s.yellowCards && `<span class="chip-s"><i class="mk y"></i> Tarjeta amarilla</span>`,
      s.redCards && `<span class="chip-s"><i class="mk r"></i> Tarjeta roja</span>`,
    ].filter(Boolean);
    const impact = s.totalGoals * 10 + s.goalAssists * 6 + s.shotsOnTarget * 2 + s.totalShots + (gk ? s.shotsFaced : 0);
    return { p, s, chips, impact };
  }).sort((a, b) => b.impact - a.impact);
  const active = played.filter(x => x.chips.length), quiet = played.filter(x => !x.chips.length);
  const role = p => [posName(p.position?.abbreviation), p.subbedIn && 'entró de cambio', p.subbedOut && 'salió de cambio'].filter(Boolean).join(', ');
  return `<h3 class="group">${img(r.team.logo || r.team.logos?.[0]?.href)} ${esc(r.team.shortDisplayName || r.team.displayName)}</h3>
  <ul class="pcards">${active.map(({ p, s, chips }) => `<li class="pcard${s.totalGoals || s.goalAssists ? ' hot' : ''}">
    <span class="shirt">${esc(p.jersey)}</span>
    <div class="pinfo"><b>${esc(p.athlete?.displayName)}</b><small>${esc(role(p))}</small>
      <div class="pstats">${chips.join('')}</div></div></li>`).join('')}</ul>
  ${quiet.length ? `<p class="quiet">Sin acciones registradas: ${quiet.map(({ p }) => esc(short(p.athlete))).join(', ')}.</p>` : ''}`;
}

// Probable XI = the starting eleven each team used in its last finished match.
async function probableLineups(d, sides) {
  const blocks = await Promise.all(sides.map(async c => {
    const games = d.lastFiveGames?.find(t => t.team.id === c.team.id)?.events ?? [];
    const last = [...games].sort((a, b) => (b.gameDate ?? '').localeCompare(a.gameDate ?? ''))[0];
    if (!last) return '';
    try {
      const s = await cached(`sum:${last.id}`, () => get(`${API}/all/summary?event=${encodeURIComponent(last.id)}`));
      const r = s.rosters?.find(x => x.team.id === c.team.id && x.roster?.length);
      return r ? lineupBlock(r.team, r.formation, r.roster.filter(p => p.starter).map(p => ({ ...p, subbedIn: false, subbedOut: false, stats: [] })),
        `Probable: titulares de su último partido (${last.atVs === '@' ? 'en' : 'vs'} ${last.opponent?.displayName ?? ''}, ${new Date(last.gameDate).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })})`) : '';
    } catch { return ''; }
  }));
  return blocks.join('') || '<p class="note">Todavía no hay alineaciones. Se publican más o menos una hora antes del partido.</p>';
}

// Everything ESPN gives about one match, as plain text for the AI (it has no internet on the free tier).
const briefs = new Map();
function matchBrief(d, home, away) {
  const nm = c => c.team.displayName;
  const L = [];
  const v = d.gameInfo?.venue;
  if (v) L.push(`Estadio: ${v.fullName} (${[v.address?.city, v.address?.country].filter(Boolean).join(', ')})`);
  const table = d.standings?.groups?.flatMap(g => g.standings?.entries ?? []) ?? [];
  for (const c of [home, away]) {
    const row = table.find(e => e.id === c.team.id);
    const st = row && Object.fromEntries(row.stats.map(s => [s.name, s.displayValue]));
    if (st) L.push(`Tabla ${nm(c)}: lugar ${st.rank}, ${st.points} pts en ${st.gamesPlayed} PJ (G-E-P ${st.wins}-${st.ties}-${st.losses}, DG ${st.pointDifferential})`);
    const games = d.lastFiveGames?.find(t => t.team.id === c.team.id)?.events ?? [];
    if (games.length) L.push(`Últimos partidos ${nm(c)}: ` + [...games].sort((a, b) => (b.gameDate ?? '').localeCompare(a.gameDate ?? ''))
      .map(e => `${{ W: 'ganó', D: 'empató', L: 'perdió' }[e.gameResult] ?? '?'} ${e.score} ${e.atVs === '@' ? 'en' : 'vs'} ${e.opponent?.displayName} (${(e.gameDate ?? '').slice(0, 10)}, ${e.leagueAbbreviation ?? ''})`).join('; '));
  }
  const h2h = d.seasonseries?.find(s => s.type === 'head-to-head')?.events?.filter(e => e.statusType?.completed) ?? [];
  if (h2h.length) L.push('Cara a cara: ' + h2h.map(e => { const h = e.competitors.find(c => c.homeAway === 'home'), a = e.competitors.find(c => c.homeAway === 'away');
    return `${e.date.slice(0, 10)} ${h.team.displayName} ${h.score}-${a.score} ${a.team.displayName}`; }).join('; '));
  const pc = d.pickcenter?.[0];
  if (pc?.homeTeamOdds?.moneyLine) L.push(`Momios ${pc.provider?.name ?? ''} (decimal): local ${decimalOdds(pc.homeTeamOdds.moneyLine).toFixed(2)}, empate ${pc.drawOdds?.moneyLine ? decimalOdds(pc.drawOdds.moneyLine).toFixed(2) : '-'}, visita ${decimalOdds(pc.awayTeamOdds.moneyLine).toFixed(2)}` +
    (pc.overUnder ? `; línea goles ${pc.overUnder}: más ${pc.overOdds ? decimalOdds(pc.overOdds).toFixed(2) : '-'}, menos ${pc.underOdds ? decimalOdds(pc.underOdds).toFixed(2) : '-'}` : ''));
  for (const t of d.leaders ?? []) {
    const top = (t.leaders ?? []).filter(c => c.leaders?.[0]).map(c => `${c.displayName}: ${c.leaders[0].athlete?.displayName} (${c.leaders[0].displayValue})`);
    if (top.length) L.push(`Figuras ${t.team?.displayName}: ${top.join('; ')}`);
  }
  const xi = (d.rosters ?? []).filter(r => r.roster?.length);
  L.push(xi.length ? xi.map(r => `Alineación confirmada ${r.team.displayName} (${r.formation ?? '?'}): ${r.roster.filter(p => p.starter).map(p => p.athlete?.displayName).join(', ')}`).join('\n')
    : 'Alineaciones: aún no publicadas.');
  return L.join('\n');
}

function previa(d, home, away, ask) {
  briefs.set(ask, matchBrief(d, home, away));
  const form = c => {
    const t = d.lastFiveGames?.find(x => x.team.id === c.team.id);
    if (!t?.events?.length) return '';
    const ev = [...t.events].sort((a, b) => (b.gameDate ?? '').localeCompare(a.gameDate ?? ''));
    const res = { W: ['G', 'w'], D: ['E', 'd'], L: ['P', 'l'] };
    return `<div class="form"><h4>${img(c.team.logos?.[0]?.href || c.team.logo)} ${esc(c.team.shortDisplayName || c.team.displayName)}
      <span class="chips-f">${ev.map(e => `<i class="r-${res[e.gameResult]?.[1] ?? 'd'}">${res[e.gameResult]?.[0] ?? '–'}</i>`).join('')}</span></h4>
      <ul>${ev.map(e => `<li><span>${esc(new Date(e.gameDate).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }))}</span>
        <span>${e.atVs === '@' ? 'en' : 'vs'} ${esc(e.opponent?.displayName)}</span><b>${esc(e.score)}</b></li>`).join('')}</ul></div>`;
  };
  const h2h = d.seasonseries?.find(s => s.type === 'head-to-head')?.events?.filter(e => e.statusType?.completed) ?? [];
  const tally = { home: 0, draw: 0, away: 0 };
  const h2hRows = h2h.map(e => {
    const h = e.competitors.find(c => c.homeAway === 'home'), a = e.competitors.find(c => c.homeAway === 'away');
    const diff = Number(h.score) - Number(a.score);
    const winner = diff === 0 ? null : diff > 0 ? h.team.id : a.team.id;
    tally[winner === home.team.id ? 'home' : winner === away.team.id ? 'away' : 'draw']++;
    return `<li><span>${esc(new Date(e.date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: '2-digit' }))}</span>
      <span>${esc(h.team.shortDisplayName || h.team.displayName)} <b>${esc(h.score)}–${esc(a.score)}</b> ${esc(a.team.shortDisplayName || a.team.displayName)}</span></li>`;
  }).join('');
  const pc = d.pickcenter?.[0];
  let odds = '';
  if (pc?.homeTeamOdds?.moneyLine && pc?.awayTeamOdds?.moneyLine) {
    const o = [['Local', pc.homeTeamOdds.moneyLine], ['Empate', pc.drawOdds?.moneyLine], ['Visita', pc.awayTeamOdds.moneyLine]].filter(x => x[1]);
    const dec = o.map(([, ml]) => decimalOdds(ml)), sum = dec.reduce((s, x) => s + 1 / x, 0);
    odds = `<h3 class="group">Momios <small>${esc(pc.provider?.name ?? '')}</small></h3><div class="odds">${o.map(([label], i) =>
      `<div><span>${label}</span><b>${dec[i].toFixed(2)}</b><small>${Math.round(100 / dec[i] / sum)}%</small></div>`).join('')}</div>
      ${pc.overUnder ? `<p class="note">Línea de goles: ${esc(pc.overUnder)} · Más ${pc.overOdds ? decimalOdds(pc.overOdds).toFixed(2) : '–'} · Menos ${pc.underOdds ? decimalOdds(pc.underOdds).toFixed(2) : '–'}</p>` : ''}`;
  }
  const NAMES = { goalsLeaders: 'Goleador', assistsLeaders: 'Asistencias' };
  const leaders = (d.leaders ?? []).map(t => {
    const rows = (t.leaders ?? []).filter(c => NAMES[c.name] && c.leaders?.[0]).map(c =>
      `<li><span>${NAMES[c.name]}</span><span>${esc(short(c.leaders[0].athlete))}</span><b>${esc((c.leaders[0].displayValue ?? '').replace('Matches', 'PJ').replace('Goals', 'Goles').replace('Assists', 'Asist.'))}</b></li>`).join('');
    return rows ? `<div class="form"><h4>${img(t.team?.logo)} ${esc(t.team?.displayName)}</h4><ul>${rows}</ul></div>` : '';
  }).join('');
  const v = d.gameInfo?.venue;
  return `
    <button class="btn ai-btn" type="button" data-ai-ask="${esc(ask)}">Analizar este partido con IA</button>
    ${v ? `<h3 class="group">Estadio</h3><p class="venue-info"><b>${esc(v.fullName)}</b><br>${esc([v.address?.city, v.address?.country].filter(Boolean).join(', '))}
      <br><span data-weather class="note">Clima: consultando…</span></p>` : ''}
    <h3 class="group">Forma (últimos 5)</h3>${form(home) + form(away) || '<p class="note">Sin datos de forma.</p>'}
    <h3 class="group">Cara a cara</h3>${h2hRows ? `<p class="h2h-tally"><b>${tally.home}</b> ${esc(home.team.shortDisplayName || home.team.displayName)} · <b>${tally.draw}</b> empates · <b>${tally.away}</b> ${esc(away.team.shortDisplayName || away.team.displayName)}</p><ul class="h2h">${h2hRows}</ul>` : '<p class="note">Sin enfrentamientos recientes registrados.</p>'}
    ${odds}
    ${leaders ? `<h3 class="group">Figuras de la temporada</h3>${leaders}` : ''}`;
}

async function weatherFor(venue, iso) {
  const city = venue.address?.city;
  if (!city) return 'Clima: sin dato';
  try {
    const g = await cached(`geo:${city}`, () => fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=10&language=en`).then(r => r.json()));
    const place = pickPlace(g.results, venue.address?.country);
    if (!place) return 'Clima: sin dato';
    const day = iso.slice(0, 10);
    const w = await cached(`wx:${place.id}:${day}`, () => fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      `&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m&timezone=UTC&start_date=${day}&end_date=${day}`).then(r => r.json()));
    const h = new Date(iso).getUTCHours(), hr = w.hourly;
    if (!hr?.time?.length) return 'Clima: el pronóstico sale unos 15 días antes del partido';
    return `Clima a la hora del partido: ${weatherText(hr.weather_code[h])}, ${Math.round(hr.temperature_2m[h])} °C, ` +
      `lluvia ${hr.precipitation_probability[h] ?? 0}%, viento ${Math.round(hr.wind_speed_10m[h])} km/h`;
  } catch { return 'Clima: sin dato'; }
}

function viewSettings() {
  const mine = myLeagues.map((id, i) => `<li><span>${esc(leagueName(id))}</span>
    <button data-move="${i}" data-delta="-1" aria-label="Subir ${esc(leagueName(id))}" ${i === 0 ? 'disabled' : ''}>↑</button>
    <button data-move="${i}" data-delta="1" aria-label="Bajar ${esc(leagueName(id))}" ${i === myLeagues.length - 1 ? 'disabled' : ''}>↓</button>
    <button data-remove="${esc(id)}" aria-label="Quitar ${esc(leagueName(id))}">Quitar</button></li>`).join('');
  const rest = LEAGUES.filter(l => !myLeagues.includes(l.id)).map(l =>
    `<li><span>${esc(l.name)}</span><button data-add="${esc(l.id)}">Agregar</button></li>`).join('');
  main.innerHTML = `
  <div class="settings">
    <h2>Mis ligas</h2>
    <p class="hint">Salen en este orden en Partidos, Próximos y Tablas.</p>
    ${mine ? `<ol class="leagues mine">${mine}</ol>` : '<p class="note">Todavía no eliges ninguna.</p>'}
    ${rest ? `<h3>Agregar liga</h3><ul class="leagues">${rest}</ul>` : ''}
    <h2>Preferencias</h2>
    <label class="row"><span>Formato de 12 horas</span><input type="checkbox" id="h12" ${h12 ? 'checked' : ''}></label>
    <label class="row"><span>Ocultar marcadores (sin spoilers)</span><input type="checkbox" id="nospoil-set" ${noSpoil ? 'checked' : ''}></label>
    <p class="about">Palco no tiene anuncios, cuenta ni rastreo. Datos: API pública de ESPN. Análisis: Claude (Anthropic).</p>
  </div>`;
}

/* ---------- analista IA ---------- */

// The analyst runs on Palco's own server (worker/ in this repo): the Anthropic key lives there, never in the app.
// Deployed from worker/ with `npm run deploy`.
const AI_URL = 'https://palco-ia.ar2men.workers.dev';

let chatApi = load('chatApi', []);   // exact messages sent to the API (thinking and search blocks included)
let chatView = load('chatView', []); // what the user sees: { role, text }
let chatBusy = false;

async function matchContext() {
  const now = new Date();
  const res = await Promise.allSettled(myLeagues.map(id => scoreboard(id, datesAround(now, 0, 2))));
  const lines = [];
  const dec = n => n ? n.toFixed(2) : '-';
  res.forEach((r, i) => r.status === 'fulfilled' && r.value
    .filter(raw => new Date(raw.date) >= addDays(now, -1))
    .forEach(raw => {
      const e = simplifyEvent(raw), { form, odds } = eventExtras(raw);
      lines.push(`${leagueName(myLeagues[i])} | ${e.home.name} vs ${e.away.name} | ` +
        `${new Date(e.date).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: h12 })} | ` +
        (e.state === 'pre' ? 'por jugar' : `${e.label} ${e.home.score}-${e.away.score}`) +
        (form.home || form.away ? ` | forma reciente (W gana, D empata, L pierde) local ${form.home || '-'}, visita ${form.away || '-'}` : '') +
        (odds ? ` | momios L ${dec(odds.home)} E ${dec(odds.draw)} V ${dec(odds.away)}${odds.total ? `, línea goles ${odds.total}` : ''}` : ''));
    }));
  return `<contexto>\nAhora: ${now.toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' })}\n` +
    `Partidos de sus ligas (hoy y 2 días):\n${lines.slice(0, 60).join('\n') || 'sin partidos'}\n</contexto>`;
}

function renderChat(note = '') {
  if (location.hash !== '#/ia') return;
  const msgs = chatView.map(m => m.role === 'user'
    ? `<div class="bubble user">${esc(m.text)}</div>` : `<div class="bubble ai">${md(m.text)}</div>`).join('');
  const ideas = ['¿Qué partidos de hoy tienen más valor?', 'Analiza el próximo partido de la Liga MX', 'Dame una opción de bajo riesgo para hoy'];
  main.innerHTML = `<div class="chat">
    ${chatView.length ? '<button class="link new-chat" type="button" data-new-chat>Nueva conversación</button>' : ''}
    ${msgs || `<div class="empty"><p>Pregunta por cualquier partido de tus ligas.</p>${ideas.map(q => `<button class="chip" type="button" data-ask="${esc(q)}">${esc(q)}</button>`).join('')}</div>`}
    ${chatBusy ? `<div class="bubble ai thinking">${loading()}<p>Buscando datos y analizando… puede tardar un minuto.</p></div>` : ''}
    ${note ? `<p class="note chat-note">${esc(note)}</p>` : ''}
    <form class="composer" data-chat-form>
      <textarea name="q" rows="1" placeholder="Pregunta al analista" aria-label="Mensaje para el analista" ${chatBusy ? 'disabled' : ''}></textarea>
      <button class="btn" type="submit" ${chatBusy ? 'disabled' : ''}>Enviar</button>
    </form></div>`;
  main.querySelector('.composer')?.scrollIntoView({ block: 'end' });
}

function viewChat() { renderChat(); }

async function sendChat(text, extra = '') {
  if (chatBusy || !text.trim()) return;
  chatBusy = true;
  const before = chatApi.length;
  chatView.push({ role: 'user', text });
  renderChat();
  let note = '';
  try {
    chatApi.push({ role: 'user', content: `${await matchContext()}${extra ? `\n<partido>\n${extra}\n</partido>` : ''}\n\n${text}` });
    let res;
    try {
      const r = await fetch(AI_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: chatApi }) });
      res = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(res.message ?? res.error ?? 'error'), { status: r.status });
    } catch (err) {
      chatApi.length = before;
      throw err;
    }
    chatApi.push(...res.messages); // assistant turns returned unchanged, sent back with the next question
    const reply = res.messages.flatMap(m => m.content).filter(b => b.type === 'text').map(b => b.text).join('');
    if (res.stop_reason === 'refusal') {
      chatApi.length = before;
      chatView.pop();
      note = 'El analista no respondió esa pregunta. Prueba a decirla de otra forma.';
    } else {
      chatView.push({ role: 'ai', text: reply || 'Sin respuesta.' + (res.stop_reason === 'max_tokens' ? ' (se cortó por largo)' : '') });
    }
  } catch (err) {
    console.error(err);
    chatView.pop();
    const s = err?.status;
    note = !navigator.onLine ? 'Sin conexión a internet. Revisa tu conexión.'
      : s === 429 ? 'Demasiadas preguntas seguidas. Espera un minuto y vuelve a enviar.'
      : /credit|billing/i.test(err?.message ?? '') ? 'El analista se quedó sin saldo. Hay que agregar créditos en la cuenta de Anthropic.'
      : `El analista no está disponible ahora (${s ?? 'sin respuesta del servidor'}). Vuelve a enviar en un momento.`;
    setTimeout(() => { const q = main.querySelector('[name=q]'); if (q) q.value = text; });
  }
  chatBusy = false;
  // Both or neither: a saved view without its API history would confuse the next reply.
  try { localStorage.setItem('chatApi', JSON.stringify(chatApi)); localStorage.setItem('chatView', JSON.stringify(chatView)); }
  catch { try { localStorage.removeItem('chatApi'); localStorage.removeItem('chatView'); } catch { /* storage off */ } }
  renderChat(note);
}

const loading = () => `<div class="loading" role="status"><span></span><span></span><span></span><span class="sr">Cargando…</span></div>`;
const noLeagues = () => { main.innerHTML = `<div class="empty"><p>Elige las ligas que sigues.</p><a class="btn" href="#/ajustes">Elegir ligas</a></div>`; };

/* ---------- router ---------- */

const routes = { '': viewDay, proximos: viewUpcoming, ia: viewChat, tablas: viewTables, ajustes: viewSettings, partido: viewMatch };

async function route(quiet = false) {
  clearTimeout(timer);
  const [name, ...args] = location.hash.replace(/^#\/?/, '').split('/');
  const view = routes[name] ?? viewDay;
  const tab = name === 'partido' ? null : `#/${routes[name] ? name : ''}`;
  document.querySelectorAll('.tabs a').forEach(a => a.toggleAttribute('aria-current', a.getAttribute('href') === tab));
  if (view !== viewDay) days.hidden = true;
  document.body.dataset.view = name || 'hoy';
  try {
    await view(...args.map(decodeURIComponent), ...(view === viewDay ? [quiet] : view === viewMatch ? [quiet] : []));
  } catch (err) {
    console.error(err);
    const msg = navigator.onLine ? 'ESPN no mandó los datos de esta pantalla. Intenta en un momento.' : 'Sin conexión a internet. Revisa tu conexión.';
    if (!quiet) main.innerHTML = `<div class="empty"><p>${msg}</p><button class="btn" data-retry>Reintentar</button></div>`;
  }
  if (!quiet) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
}

/* ---------- events ---------- */

function setSpoil(on) {
  noSpoil = on; save('sinSpoilers', on);
  document.body.classList.toggle('nospoil', on);
  $('#spoil').setAttribute('aria-pressed', on);
}

document.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.day) { day = new Date(t.dataset.day.replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3T12:00')); route(); }
  else if (t.id === 'spoil') { setSpoil(!noSpoil); }
  else if (t.dataset.retry != null) { route(); }
  else if (t.dataset.back != null) { history.length > 1 ? history.back() : (location.hash = '#/'); }
  else if (t.classList.contains('reveal-btn')) { t.closest('.match-view').classList.add('reveal'); t.remove(); }
  else if (t.dataset.tab) {
    const view = t.closest('.match-view');
    view.querySelectorAll('[role=tab]').forEach(b => b.setAttribute('aria-selected', b === t));
    view.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== t.dataset.tab; });
    matchTab.set(t.closest('[data-match]').dataset.match, t.dataset.tab);
  }
  else if (t.dataset.move != null) { myLeagues = moveItem(myLeagues, +t.dataset.move, +t.dataset.delta); save('ligas', myLeagues); viewSettings(); }
  else if (t.dataset.remove) { myLeagues = myLeagues.filter(id => id !== t.dataset.remove); save('ligas', myLeagues); viewSettings(); }
  else if (t.dataset.add) { myLeagues = [...myLeagues, t.dataset.add]; save('ligas', myLeagues); viewSettings(); }
  else if (t.dataset.ask) { sendChat(t.dataset.ask); }
  else if (t.dataset.aiAsk) { const q = t.dataset.aiAsk; location.hash = '#/ia'; setTimeout(() => sendChat(q, briefs.get(q)), 0); }
  else if (t.dataset.newChat != null && !chatBusy) { chatApi = []; chatView = []; save('chatApi', []); save('chatView', []); renderChat(); }
});

document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  if (f.dataset.chatForm != null) sendChat(f.q.value);
});

document.addEventListener('change', e => {
  if (e.target.id === 'h12') { h12 = e.target.checked; save('h12', h12); }
  if (e.target.id === 'nospoil-set') setSpoil(e.target.checked);
});

// Coming back to the app after a while: jump to today and refresh.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (Date.now() - hiddenAt > 10 * 60e3 && !location.hash.startsWith('#/partido')) { day = new Date(); }
  if (Date.now() - hiddenAt > 30e3 && location.hash !== '#/ia') route(true);
});

window.addEventListener('hashchange', () => route());
setSpoil(noSpoil);
route();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
