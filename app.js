import { LEAGUES, DEFAULT_LEAGUES, ymd, addDays, datesAround, uniqueEvents, eventsForDay,
  simplifyEvent, simplifyStandings, statusLabel, moveItem, md, pitchRows, decimalOdds, weatherText, pickPlace, eventExtras, leagueLogo, teamStreaks, h2hStreaks, momentum } from './lib.js';

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
let day = new Date(); // always opens on today, on purpose
let timer;
let theme = load('tema', 'auto');
const applyTheme = () => { if (theme === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme; };
applyTheme();
let favTeams = load('favoritos', []); // [{ id, lg, name, logo }]
const isFav = id => favTeams.some(t => t.id === id);

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
  return `<a class="match ${e.state}${trackScore(e, lg)}${isFav(e.home.id) || isFav(e.away.id) ? ' fav' : ''}" href="#/partido/${esc(lg)}/${esc(e.id)}">
    <span class="when">${when}</span>
    <span class="teams">${team(e.home)}${team(e.away)}</span>
    <span class="score">${score}</span></a>`;
}

// "En vivo ahora": every match being played in the user's leagues, as swipeable cards.
const liveStrip = items => items.length ? `<section class="live-strip" aria-label="En vivo ahora"><h2><i></i>En vivo ahora</h2>
  <div class="live-cards">${items.map(({ e, lg }) => `<a class="live-card" href="#/partido/${esc(lg)}/${esc(e.id)}">
    <small>${esc(leagueName(lg))} <b>${esc(e.label)}</b></small>
    <span>${img(e.home.logo)}<em>${esc(e.home.name)}</em><b>${esc(e.home.score)}</b></span>
    <span>${img(e.away.logo)}<em>${esc(e.away.name)}</em><b>${esc(e.away.score)}</b></span></a>`).join('')}</div></section>` : '';
let dayFilter = '';

const leagueBlock = (id, body) =>
  `<section class="league"><h2><span>${img(leagueLogo(id), 'crest lg')}${esc(leagueName(id))}</span>
    <a class="to-table" href="#/tablas/${esc(id)}">Tabla</a></h2>${body}</section>`;

function renderDays() {
  days.hidden = false;
  days.innerHTML = Array.from({ length: 15 }, (_, i) => addDays(new Date(), i - 7)).map(d =>
    `<button data-day="${ymd(d)}" aria-pressed="${ymd(d) === ymd(day)}">${esc(fmtDay(d))}</button>`).join('');
  days.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

async function viewDay() {
  if (quietRender) days.hidden = false; else renderDays(); // a refresh must not move the day strip
  if (!myLeagues.length) return noLeagues();
  if (!quietRender) main.innerHTML = loading();
  const res = await Promise.allSettled(myLeagues.map(id => scoreboard(id, datesAround(day))));
  let html = '';
  const empty = [], live = [], playing = [], favs = [];
  res.forEach((r, i) => {
    const id = myLeagues[i];
    if (r.status === 'rejected') { if (!dayFilter || dayFilter === id) html += leagueBlock(id, `<p class="note">No se pudo cargar esta liga.</p>`); return; }
    const evs = eventsForDay(r.value, day);
    if (!evs.length) return empty.push(leagueName(id));
    playing.push(id);
    evs.filter(e => e.state === 'in').forEach(e => live.push({ e, lg: id }));
    evs.filter(e => isFav(e.home.id) || isFav(e.away.id)).forEach(e => favs.push({ e, lg: id }));
    if (!dayFilter || dayFilter === id) html += leagueBlock(id, evs.map(e => matchRow(e, id)).join(''));
  });
  liveNow = live.length > 0;
  if (dayFilter && !playing.includes(dayFilter) && !(dayFilter === 'fav' && favs.length)) dayFilter = '';
  const opts = [['', 'Todas'], ...(favs.length ? [['fav', '★ Mis equipos']] : []), ...playing.map(id => [id, leagueName(id)])];
  const filters = opts.length > 2 ? `<div class="chips filters">${opts.map(([id, label]) =>
    `<button type="button" data-filter="${esc(id)}" aria-pressed="${dayFilter === id}">${leagueLogo(id) ? img(leagueLogo(id), 'crest sm') : ''}${esc(label)}</button>`).join('')}</div>` : '';
  const favBlock = favs.length ? `<section class="league mine-block"><h2><span>★ Tus equipos hoy</span></h2>${favs.map(({ e, lg }) => matchRow(e, lg)).join('')}</section>` : '';
  if (dayFilter === 'fav') html = '';
  main.innerHTML = html || favBlock
    ? liveStrip(dayFilter && dayFilter !== 'fav' ? live.filter(x => x.lg === dayFilter) : live) + filters + (dayFilter && dayFilter !== 'fav' ? '' : favBlock) + html +
      (empty.length && !dayFilter ? `<p class="rest">Sin partidos este día: ${empty.map(esc).join(', ')}.</p>` : '')
    : `<div class="empty"><p>Tus ligas no juegan este día.</p><a class="btn" href="#/proximos">Ver próximos partidos</a></div>`;
}

async function viewUpcoming() {
  if (!myLeagues.length) return noLeagues();
  if (!quietRender) main.innerHTML = loading();
  const today = new Date();
  const res = await Promise.allSettled(myLeagues.map(id => scoreboard(id, datesAround(today, 0, 7))));
  const all = [];
  res.forEach((r, i) => r.status === 'fulfilled' && r.value.forEach(e => {
    const s = simplifyEvent(e);
    if (s.state !== 'post' && new Date(s.date) >= addDays(today, -1)) all.push({ ...s, lg: myLeagues[i], order: i });
  }));
  liveNow = all.some(e => e.state === 'in');
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
  if (!quietRender) main.innerHTML = chips + loading();
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

async function viewMatch(lg, id) {
  if (!quietRender) main.innerHTML = loading();
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

  liveNow = state === 'in';
  icsData.set(id, { title: `${home.team.displayName} vs ${away.team.displayName}`, start: comp.date, place: [d.gameInfo?.venue?.fullName, d.gameInfo?.venue?.address?.city].filter(Boolean).join(', '), comp: LEAGUES.some(l => l.id === lg) ? leagueName(lg) : d.header?.league?.name ?? '' });
  const flash = trackScore({ id, state, home: { name: home.team.shortDisplayName || home.team.displayName, score: home.score }, away: { name: away.team.shortDisplayName || away.team.displayName, score: away.score } }, lg);
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
      <p class="comp">${esc(LEAGUES.some(l => l.id === lg) ? leagueName(lg) : d.header?.league?.name ?? '')}</p>
      <div class="board">
        <a class="side" href="#/equipo/${esc(lg)}/${esc(home.team.id)}">${img(logo(home), 'crest big')}<span>${isFav(home.team.id) ? '★ ' : ''}${name(home)}</span></a>
        <div class="bigscore${flash}">${state === 'pre' ? '<span class="vs">vs</span>' : `${esc(home.score)}<span>–</span>${esc(away.score)}`}</div>
        <a class="side" href="#/equipo/${esc(lg)}/${esc(away.team.id)}">${img(logo(away), 'crest big')}<span>${isFav(away.team.id) ? '★ ' : ''}${name(away)}</span></a>
      </div>
      ${state === 'pre' ? `<button class="cal-btn" type="button" data-ics="${esc(id)}">＋ Agregar a mi calendario</button>` : ''}
      <p class="status ${state}">${state === 'in' ? '<i class="pulse"></i>' : ''}${esc(statusText)}</p>
    </header>
    <div class="seg" role="tablist" data-match="${esc(id)}">${tabs.map(([k, label]) =>
      `<button role="tab" aria-selected="${k === tab}" data-tab="${k}">${label}</button>`).join('')}</div>
    ${panel('previa', previa(d, home, away, ask))}
    ${panel('resumen', events ? `${timelineBar(d, home)}<ol class="timeline">${events}</ol>` : `<p class="note">${state === 'pre' ? 'El partido no ha empezado.' : 'Sin eventos todavía.'}</p>`)}
    ${panel('stats', stats ? `${momentumChart(d, home, away)}<ul class="stats">${stats}</ul>` : '<p class="note">Las estadísticas aparecen cuando empieza el partido.</p>')}
    ${panel('jugadores', players ? players : '<p class="note">Las estadísticas de cada jugador aparecen cuando empieza el partido.</p>')}
    ${panel('alineaciones', lineup || '<div data-probable><p class="note">Buscando la alineación probable…</p></div>')}
  </article>`;
  if (!lineup) probableLineups(d, [home, away]).then(html => { const el = main.querySelector('[data-probable]'); if (el) el.innerHTML = html; });
  if (venue) weatherFor(venue, comp.date).then(txt => { const el = main.querySelector('[data-weather]'); if (el && txt) el.textContent = txt; });
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
    `<a class="pl" href="#/jugador/${esc(p.athlete?.id)}"><span class="shirt">${esc(p.jersey)}</span><span class="pname">${esc(short(p.athlete))}</span><span class="marks">${marks(p)}</span></a>`).join('')}</div>`).join('');
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
    <div class="pinfo"><a class="plink" href="#/jugador/${esc(p.athlete?.id)}"><b>${esc(p.athlete?.displayName)}</b></a><small>${esc(role(p))}</small>
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

// Streaks in the style of Prisma: how often each side wins, scores, keeps a clean sheet, sees both teams score, goes over 2.5.
function rachas(d, home, away, h2h) {
  const sides = [home, away].map(c => ({ c, s: teamStreaks(d.lastFiveGames?.find(t => t.team.id === c.team.id)?.events, c.team.id) }));
  if (!sides.some(x => x.s)) return '';
  const rows = [['Ganó', s => s.won], ['Anotó', s => s.scored], ['Portería a cero', s => s.cleanSheet], ['Ambos anotaron', s => s.btts], ['Más de 2.5 goles', s => s.over25]];
  const cell = (s, f) => s ? `<span class="rate"><b>${f(s)}/${s.n}</b><i style="width:${Math.round(100 * f(s) / s.n)}%"></i></span>` : '<span class="rate">–</span>';
  const nm = c => esc(c.team.shortDisplayName || c.team.displayName);
  const hs = h2hStreaks(h2h.map(e => ({ h: Number(e.competitors.find(c => c.homeAway === 'home').score), a: Number(e.competitors.find(c => c.homeAway === 'away').score) })));
  return `<h3 class="group">Rachas (últimos partidos)</h3>
    <div class="rachas"><div class="rh"><span></span><b>${nm(home)}</b><b>${nm(away)}</b></div>
    ${rows.map(([label, f]) => `<div><span>${label}</span>${cell(sides[0].s, f)}${cell(sides[1].s, f)}</div>`).join('')}
    <div><span>Goles a favor por partido</span><span class="rate"><b>${sides[0].s ? sides[0].s.gfAvg.toFixed(1) : '–'}</b></span><span class="rate"><b>${sides[1].s ? sides[1].s.gfAvg.toFixed(1) : '–'}</b></span></div>
    <div><span>Goles en contra por partido</span><span class="rate"><b>${sides[0].s ? sides[0].s.gaAvg.toFixed(1) : '–'}</b></span><span class="rate"><b>${sides[1].s ? sides[1].s.gaAvg.toFixed(1) : '–'}</b></span></div></div>
    ${hs ? `<p class="note">Entre ellos (${hs.n} partidos): ambos anotaron ${hs.btts}/${hs.n}, más de 2.5 goles ${hs.over25}/${hs.n}, ${hs.goalsAvg.toFixed(1)} goles por partido.</p>` : ''}`;
}

// 0'-90' bar with each goal, card and sub at its minute: home above the line, away below.
const minuteOf = v => { const m = String(v ?? '').match(/(\d+)'(?:\s*\+\s*(\d+))?/); return m ? Number(m[1]) + Number(m[2] ?? 0) : null; };
function timelineBar(d, home) {
  const evs = (d.keyEvents ?? []).filter(k => KIND[k.type?.type] || k.scoringPlay).map(k => ({ min: minuteOf(k.clock?.displayValue), kind: KIND[k.type.type] ?? 'gol', home: k.team?.id === home.team.id, who: k.participants?.[0]?.athlete?.displayName }))
    .filter(e => e.min != null);
  if (!evs.length) return '';
  const end = Math.max(90, ...evs.map(e => e.min));
  const now = minuteOf(d.header?.competitions?.[0]?.status?.displayClock);
  return `<div class="tl" role="img" aria-label="Línea de tiempo del partido">
    ${now && d.header.competitions[0].status.type.state === 'in' ? `<i class="tl-now" style="left:${Math.min(100, 100 * now / end)}%"></i>` : ''}
    ${evs.map(e => `<i class="tl-ev ${e.kind} ${e.home ? 'up' : 'down'}" style="left:${100 * e.min / end}%" title="${esc(e.min + "' " + (e.who ?? ''))}"></i>`).join('')}
    <span class="tl-mid"></span><small class="tl-0">0'</small><small class="tl-45">45'</small><small class="tl-90">${end}'</small></div>`;
}

// Who pressed more: shots, shots on target, corners and goals per 15 minutes.
function momentumChart(d, home, away) {
  const names = c => [c.team.displayName, c.team.shortDisplayName, c.team.location, c.team.name].filter(Boolean);
  const bins = momentum(d.commentary, names(home), names(away));
  const max = Math.max(1, ...bins.flatMap(b => [b.home, b.away]));
  if (bins.every(b => !b.home && !b.away)) return '';
  return `<h3 class="group">Presión por tramos</h3><div class="mom" role="img" aria-label="Presión de cada equipo cada 15 minutos">
    ${bins.map((b, i) => `<div class="mom-col"><i class="h" style="height:${100 * b.home / max}%"></i><i class="a" style="height:${100 * b.away / max}%"></i><small>${i * 15}'</small></div>`).join('')}</div>
    <p class="note mom-key"><i class="h"></i>${esc(home.team.shortDisplayName || home.team.displayName)} <i class="a"></i>${esc(away.team.shortDisplayName || away.team.displayName)} · tiros, tiros a puerta, córners y goles</p>`;
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
    ${rachas(d, home, away, h2h)}
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
    <h2>Mis equipos</h2>
    <p class="hint">Toca el escudo de un equipo y luego "Seguir equipo". Sus partidos salen primero y con estrella.</p>
    ${favTeams.length ? `<ul class="leagues">${favTeams.map(t => `<li><span>${img(t.logo, 'crest sm')} <a href="#/equipo/${esc(t.lg)}/${esc(t.id)}">${esc(t.name)}</a></span>
      <button data-unfav="${esc(t.id)}" aria-label="Dejar de seguir ${esc(t.name)}">Quitar</button></li>`).join('')}</ul>` : '<p class="note">Todavía no sigues ningún equipo.</p>'}
    <h2>Avisos de goles</h2>
    <p class="hint">Te avisa de inicio, goles y final de tus equipos aunque Palco esté cerrada. En iPhone, Palco debe estar instalada en la pantalla de inicio.</p>
    <div class="row"><span id="push-state">${pushLabel()}</span><button class="btn small" type="button" data-push>${pushOn() ? 'Desactivar' : 'Activar avisos'}</button></div>
    <h2>Preferencias</h2>
    <div class="row"><span>Tema</span><div class="seg-mini">${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([k, l]) =>
      `<button type="button" data-theme-set="${k}" aria-pressed="${theme === k}">${l}</button>`).join('')}</div></div>
    <label class="row"><span>Formato de 12 horas</span><input type="checkbox" id="h12" ${h12 ? 'checked' : ''}></label>
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
    ? `<div class="bubble user">${m.img ? `<img class="sent-img" src="${m.img}" alt="Captura enviada">` : ''}${esc(m.text)}</div>` : `<div class="bubble ai">${md(m.text)}</div>`).join('');
  const ideas = ['¿Qué partidos de hoy tienen más valor?', 'Analiza el próximo partido de la Liga MX', 'Dame una opción de bajo riesgo para hoy'];
  const hintImg = '<p class="note">También puedes mandar una captura de Playdoit con el botón de cámara y te digo dónde hay valor.</p>';
  main.innerHTML = `<div class="chat">
    ${chatView.length ? '<button class="link new-chat" type="button" data-new-chat>Nueva conversación</button>' : ''}
    ${msgs || `<div class="empty"><p>Pregunta por cualquier partido de tus ligas.</p>${ideas.map(q => `<button class="chip" type="button" data-ask="${esc(q)}">${esc(q)}</button>`).join('')}${hintImg}</div>`}
    ${chatBusy ? `<div class="bubble ai thinking">${loading()}<p>Buscando datos y analizando… puede tardar un minuto.</p></div>` : ''}
    ${note ? `<p class="note chat-note">${esc(note)}</p>` : ''}
    ${pendingImg ? `<div class="img-ready"><img src="${pendingImg.thumb}" alt="Captura lista para enviar"><span>Captura lista</span><button type="button" class="link" data-clear-img>Quitar</button></div>` : ''}
    <form class="composer" data-chat-form>
      <label class="attach" title="Mandar captura de pantalla (por ejemplo de Playdoit)"><input type="file" accept="image/*" data-attach hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M9 6l1.5-2h3L15 6"/></svg><span class="sr">Adjuntar captura</span></label>
      <textarea name="q" rows="1" placeholder="Pregunta al analista" aria-label="Mensaje para el analista" ${chatBusy ? 'disabled' : ''}></textarea>
      <button class="btn" type="submit" ${chatBusy ? 'disabled' : ''}>Enviar</button>
    </form></div>`;
  main.querySelector('.composer')?.scrollIntoView({ block: 'end' });
}

function viewChat() { renderChat(); }

async function sendChat(text, extra = '') {
  if (chatBusy || (!text.trim() && !pendingImg)) return;
  if (!text.trim()) text = 'Analiza esta captura: lee los momios y dime dónde hay valor.';
  const shot = pendingImg; pendingImg = null;
  chatBusy = true;
  const before = chatApi.length;
  chatView.push({ role: 'user', text, img: shot?.thumb });
  renderChat();
  let note = '';
  try {
    const userText = `${await matchContext()}${extra ? `\n<partido>\n${extra}\n</partido>` : ''}\n\n${text}`;
    chatApi.push({ role: 'user', content: shot ? [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: shot.data } }, { type: 'text', text: userText }] : userText });
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
  const slim = chatApi.map(m => Array.isArray(m.content) && m.content.some(b => b.type === 'image')
    ? { ...m, content: m.content.map(b => b.type === 'image' ? { type: 'text', text: '[El usuario mandó una captura de pantalla]' } : b) } : m);
  try { localStorage.setItem('chatApi', JSON.stringify(slim)); localStorage.setItem('chatView', JSON.stringify(chatView)); }
  catch { try { localStorage.removeItem('chatApi'); localStorage.removeItem('chatView'); } catch { /* storage off */ } }
  renderChat(note);
}

const loading = () => `<div class="loading" role="status"><span></span><span></span><span></span><span class="sr">Cargando…</span></div>`;
const noLeagues = () => { main.innerHTML = `<div class="empty"><p>Elige las ligas que sigues.</p><a class="btn" href="#/ajustes">Elegir ligas</a></div>`; };

/* ---------- team & player pages ---------- */

const ATH = 'https://site.web.api.espn.com/apis/common/v3/sports/soccer/athletes';
const scoreText = s => s == null ? '' : typeof s === 'object' ? (s.displayValue ?? '') : String(s);
const RES = { W: ['G', 'w'], D: ['E', 'd'], L: ['P', 'l'] };

async function viewTeam(lg, id) {
  if (!quietRender) main.innerHTML = loading();
  // ESPN's /teams/{id} has no CORS header; the schedule responses carry the same team info.
  const [past, next] = await Promise.all([
    get(`${API}/${lg}/teams/${encodeURIComponent(id)}/schedule`),
    get(`${API}/${lg}/teams/${encodeURIComponent(id)}/schedule?fixture=true`).catch(() => ({ events: [] })),
  ]);
  const t = { ...past.team, logos: [{ href: past.team?.logo }], record: { items: [{ summary: past.team?.recordSummary }] } };
  const row = e => {
    const c = e.competitions?.[0] ?? {}, me = c.competitors?.find(x => x.team?.id === id), op = c.competitors?.find(x => x.team?.id !== id);
    const state = c.status?.type?.state ?? 'pre', gf = Number(scoreText(me?.score)), ga = Number(scoreText(op?.score));
    const r = state !== 'post' ? null : gf > ga ? 'W' : gf < ga ? 'L' : 'D';
    return { id: e.id, date: e.date, state, r, home: me?.homeAway === 'home', op: op?.team, gf, ga };
  };
  const results = (past.events ?? []).map(row).filter(x => x.state === 'post').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const coming = (next.events ?? []).map(row).filter(x => x.state !== 'post').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  liveNow = coming.some(x => x.state === 'in');
  const line = x => `<a class="trow" href="#/partido/all/${esc(x.id)}">
    <span class="tdate">${esc(new Date(x.date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }))}${x.state === 'pre' ? `<br>${fmtTime(x.date)}` : ''}</span>
    <span class="topp">${img(x.op?.logo || x.op?.logos?.[0]?.href)}<span>${x.home ? 'vs' : 'en'} ${esc(x.op?.shortDisplayName || x.op?.displayName)}</span></span>
    ${x.r ? `<b class="tscore">${x.gf}-${x.ga}</b><i class="r-${RES[x.r][1]}">${RES[x.r][0]}</i>` : x.state === 'in' ? '<b class="tscore live">En vivo</b>' : ''}</a>`;
  const following = isFav(id);
  main.innerHTML = `<article class="team-view">
    <header class="pitch team-head">
      <button class="back" type="button" data-back aria-label="Volver">‹</button>
      ${img(t.logos?.[0]?.href, 'crest big')}
      <h2>${esc(t.displayName)}</h2>
      <p class="comp">${esc((t.standingSummary ?? '').replace(/^(\d+)\w{2} in .+$/, `Lugar $1 en ${leagueName(lg)}`) || leagueName(lg))}${t.record?.items?.[0]?.summary ? `, récord ${esc(t.record.items[0].summary)} (G-E-P)` : ''}</p>
      <button class="follow" type="button" data-follow="${esc(id)}" data-lg="${esc(lg)}" data-name="${esc(t.displayName)}" data-logo="${esc(t.logos?.[0]?.href ?? '')}" aria-pressed="${following}">${following ? '★ Siguiendo' : '☆ Seguir equipo'}</button>
    </header>
    <section class="team-body">
      ${results.length ? `<h3 class="group">Forma <span class="chips-f">${[...results].slice(0, 5).reverse().map(x => `<i class="r-${RES[x.r][1]}">${RES[x.r][0]}</i>`).join('')}</span></h3>` : ''}
      <h3 class="group">Próximos partidos</h3>${coming.map(line).join('') || '<p class="note">Sin partidos programados.</p>'}
      <h3 class="group">Resultados</h3>${results.map(line).join('') || '<p class="note">Sin resultados esta temporada.</p>'}
      ${LEAGUES.some(l => l.id === lg) ? `<a class="btn ghost" href="#/tablas/${esc(lg)}">Ver tabla de ${esc(leagueName(lg))}</a>` : ''}
    </section></article>`;
}

const STAT_ES = { STRT: 'Titular', APP: 'Partidos', G: 'Goles', A: 'Asistencias', SHOT: 'Tiros', SOG: 'Tiros a puerta', FC: 'Faltas cometidas',
  FA: 'Faltas recibidas', YC: 'Amarillas', RC: 'Rojas', OFF: 'Fueras de lugar', SV: 'Atajadas', GA: 'Goles en contra', SHF: 'Tiros recibidos' };
const POS_ES = { Goalkeeper: 'Portero', Defender: 'Defensa', Midfielder: 'Mediocampista', Forward: 'Delantero' };

async function viewPlayer(id) {
  if (!quietRender) main.innerHTML = loading();
  const [prof, over, log] = await Promise.all([
    get(`${ATH}/${encodeURIComponent(id)}`),
    get(`${ATH}/${encodeURIComponent(id)}/overview`).catch(() => ({})),
    get(`${ATH}/${encodeURIComponent(id)}/gamelog`).catch(() => ({})),
  ]);
  const a = prof.athlete ?? {};
  const cm = a.height ? Math.round(a.height * 2.54) : null, kg = a.weight ? Math.round(a.weight * 0.4536) : null;
  const facts = [a.age && `${a.age} años`, POS_ES[a.position?.displayName] ?? a.position?.displayName, a.citizenship, cm && `${(cm / 100).toFixed(2)} m`, kg && `${kg} kg`].filter(Boolean);
  const st = over.statistics;
  const seasons = (st?.splits ?? []).map(sp => {
    const v = Object.fromEntries((st.labels ?? []).map((l, i) => [l, sp.stats?.[i]]));
    return `<div class="season"><h4>${esc(sp.displayName)}</h4><div class="pstats">${Object.entries(v).filter(([l, x]) => STAT_ES[l] && Number(x)).map(([l, x]) =>
      `<span class="chip-s${l === 'G' ? ' goal' : l === 'A' ? ' strong' : ''}">${esc(x)} ${STAT_ES[l].toLowerCase()}</span>`).join('') || '<span class="note">Sin registros</span>'}</div></div>`;
  }).join('');
  const cat = log.seasonTypes?.[0]?.categories?.[0];
  const games = (cat?.events ?? []).slice(0, 8).map(g => {
    const ev = log.events?.[g.eventId] ?? {}, v = Object.fromEntries((log.labels ?? []).map((l, i) => [l, g.stats?.[i]]));
    const chips = Object.entries(v).filter(([l, x]) => STAT_ES[l] && Number(x)).map(([l, x]) => `${x} ${STAT_ES[l].toLowerCase()}`).join(', ');
    return `<a class="trow" href="#/partido/all/${esc(g.eventId)}"><span class="tdate">${esc(new Date(ev.gameDate ?? Date.now()).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }))}</span>
      <span class="topp">${img(ev.opponent?.logo)}<span>${ev.atVs === '@' ? 'en' : 'vs'} ${esc(ev.opponent?.displayName ?? '')}<small>${esc(chips || 'sin acciones registradas')}</small></span></span>
      ${ev.gameResult ? `<i class="r-${RES[ev.gameResult]?.[1] ?? 'd'}">${RES[ev.gameResult]?.[0] ?? '–'}</i>` : ''}</a>`;
  }).join('');
  main.innerHTML = `<article class="team-view">
    <header class="pitch team-head">
      <button class="back" type="button" data-back aria-label="Volver">‹</button>
      <span class="shirt big-shirt">${esc(a.jersey ?? '')}</span>
      <h2>${esc(a.displayName ?? '')}</h2>
      <p class="comp">${esc(a.team?.displayName ?? '')}</p>
      <p class="facts">${facts.map(esc).join(', ')}</p>
    </header>
    <section class="team-body">
      <h3 class="group">Esta temporada</h3>${seasons || '<p class="note">Sin estadísticas de temporada.</p>'}
      <h3 class="group">Últimos partidos</h3>${games || '<p class="note">Sin partidos registrados.</p>'}
    </section></article>`;
}

/* ---------- search, calendar, screenshots, swipe ---------- */

async function viewSearch() {
  if (!quietRender) main.innerHTML = `<div class="search"><input type="search" id="q" placeholder="Busca un equipo de tus ligas" aria-label="Buscar equipo" autocomplete="off"><div id="results">${loading()}</div></div>`;
  // ESPN's /teams list has no CORS header; every league table lists its teams too.
  const lists = await Promise.allSettled(myLeagues.map(lg => cached(`table:${lg}`, () => get(`${API_STANDINGS}/${lg}/standings`))
    .then(d => (d.children?.length ? d.children : [d]).flatMap(g => g.standings?.entries ?? []).map(e => ({ ...e.team, lg })))));
  const seen = new Set();
  allTeams = lists.flatMap(r => r.status === 'fulfilled' ? r.value : []).filter(t => !seen.has(t.id + t.lg) && seen.add(t.id + t.lg));
  const q = $('#q'); q?.focus(); showResults(q?.value ?? '');
}
let allTeams = [];
const normName = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function showResults(q) {
  const el = $('#results');
  if (!el) return;
  const n = normName(q.trim());
  const hits = allTeams.filter(t => !n || normName(`${t.displayName} ${t.shortDisplayName} ${t.abbreviation} ${t.location}`).includes(n)).slice(0, n ? 40 : 0);
  el.innerHTML = !n ? '<p class="note">Escribe el nombre de un equipo.</p>' : hits.length ? `<ul class="leagues">${hits.map(t =>
    `<li><a class="hit" href="#/equipo/${esc(t.lg)}/${esc(t.id)}">${img(t.logos?.[0]?.href, 'crest')} <span>${esc(t.displayName)}<small>${esc(leagueName(t.lg))}</small></span>${isFav(t.id) ? ' ★' : ''}</a></li>`).join('')}</ul>`
    : '<p class="note">Ningún equipo de tus ligas coincide. Puedes agregar más ligas en Ajustes.</p>';
}
document.addEventListener('input', e => { if (e.target.id === 'q') showResults(e.target.value); });

const icsData = new Map();
function downloadIcs(id) {
  const m = icsData.get(id);
  if (!m) return;
  const f = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const clean = s => String(s).replace(/[,;\\]/g, ' ');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Palco//ES', 'BEGIN:VEVENT', `UID:${id}@palco`, `DTSTAMP:${f(Date.now())}`,
    `DTSTART:${f(m.start)}`, `DTEND:${f(new Date(m.start).getTime() + 2 * 3600e3)}`, `SUMMARY:${clean(m.title)}`, `LOCATION:${clean(m.place)}`,
    `DESCRIPTION:${clean(m.comp)}`, 'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', `DESCRIPTION:${clean(m.title)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })), download: `${m.title}.ics` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Screenshots for the analyst: shrink to a JPEG of at most 1280 px so it travels fast and fits the request.
let pendingImg = null;
async function readImage(file) {
  const bmp = await createImageBitmap(file);
  const draw = max => { const k = Math.min(1, max / Math.max(bmp.width, bmp.height)); const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.82); };
  return { data: draw(1280).split(',')[1], thumb: draw(240) };
}
document.addEventListener('change', async e => {
  if (!e.target.matches('[data-attach]') || !e.target.files?.[0]) return;
  try { pendingImg = await readImage(e.target.files[0]); } catch { pendingImg = null; }
  renderChat(pendingImg ? '' : 'No se pudo leer esa imagen. Prueba con otra captura.');
});

// Swipe left/right on a match to move between its tabs.
let touch0 = null;
document.addEventListener('touchstart', e => { touch0 = e.target.closest('.match-view section, .match-view .seg') ? e.touches[0] : null; }, { passive: true });
document.addEventListener('touchend', e => {
  if (!touch0) return;
  const t = e.changedTouches[0], dx = t.clientX - touch0.clientX, dy = t.clientY - touch0.clientY;
  touch0 = null;
  if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  const tabs = [...document.querySelectorAll('.match-view .seg [role=tab]')], i = tabs.findIndex(b => b.getAttribute('aria-selected') === 'true');
  const next = tabs[i + (dx < 0 ? 1 : -1)];
  if (next) { next.click(); next.scrollIntoView({ inline: 'center', block: 'nearest' }); }
});

/* ---------- goal alerts with the app closed (Web Push) ---------- */

// Public VAPID key of Palco's server (worker/wrangler.toml); the private half is a secret on the server.
const VAPID_PUBLIC = 'BL8BWw4USJe5YALmSprzFK4PVsTTHtxVnmGlIJIrHYnuMKJdH3lt3wVWnNoEFqKfXB9QQGyTEgrTiIWZwbMz_Pc';
let pushSub = null, pushNote = '';
const pushOn = () => !!pushSub;
const pushLabel = () => pushNote || (!('PushManager' in window) ? 'Este navegador no permite avisos. En iPhone: instala Palco en la pantalla de inicio y ábrela desde ahí.'
  : pushOn() ? `Activados para ${favTeams.length} ${favTeams.length === 1 ? 'equipo' : 'equipos'}.` : 'Desactivados.');
navigator.serviceWorker?.ready.then(r => r.pushManager?.getSubscription()).then(s => { pushSub = s ?? null; }).catch(() => {});
const keyBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
const post = (path, body) => fetch(`${AI_URL}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function togglePush() {
  pushNote = '';
  try {
    const reg = await navigator.serviceWorker.ready;
    if (pushSub) {
      await post('/unsubscribe', { endpoint: pushSub.endpoint }).catch(() => {});
      await pushSub.unsubscribe();
      pushSub = null;
    } else if (!favTeams.length) {
      pushNote = 'Primero sigue al menos un equipo (toca su escudo y "Seguir equipo").';
    } else if (!reg.pushManager) {
      pushNote = 'Este navegador no permite avisos. En iPhone: instala Palco en la pantalla de inicio y ábrela desde ahí.';
    } else if (await Notification.requestPermission() !== 'granted') {
      pushNote = 'No diste permiso de notificaciones. Actívalo en los ajustes del teléfono para Palco.';
    } else {
      pushSub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) });
      const r = await post('/subscribe', { sub: pushSub.toJSON(), teams: favTeams.map(t => ({ id: t.id, lg: t.lg, name: t.name })) });
      if (!r.ok) throw new Error(`subscribe ${r.status}`);
    }
  } catch (err) {
    console.error(err);
    pushNote = 'No se pudieron activar los avisos. Intenta de nuevo en un momento.';
  }
  if (location.hash === '#/ajustes') viewSettings();
}

// Following or unfollowing a team updates what the server watches.
function syncPush() {
  if (pushSub) post('/subscribe', { sub: pushSub.toJSON(), teams: favTeams.map(t => ({ id: t.id, lg: t.lg, name: t.name })) }).catch(() => {});
}


/* ---------- router ---------- */

const routes = { '': viewDay, proximos: viewUpcoming, ia: viewChat, tablas: viewTables, ajustes: viewSettings, partido: viewMatch, equipo: viewTeam, jugador: viewPlayer, buscar: viewSearch };

// Live engine: every data screen re-renders itself quietly on a timer, faster while a match is being played.
const REFRESH = { '': 60, proximos: 60, partido: 60, tablas: 120, equipo: 120 }; // seconds; chat and settings don't refresh
const LIVE_REFRESH = 20;
let quietRender = false, liveNow = false, updatedAt = 0;
const lastScore = new Map(); // event id -> "h-a", to spot new goals between refreshes
const newGoals = [];

async function route(quiet = false) {
  clearTimeout(timer);
  const [name, ...args] = location.hash.replace(/^#\/?/, '').split('/');
  const view = routes[name] ?? viewDay;
  const tab = ['partido', 'equipo', 'jugador', 'buscar'].includes(name) ? null : `#/${routes[name] ? name : ''}`;
  document.querySelectorAll('.tabs a').forEach(a => a.toggleAttribute('aria-current', a.getAttribute('href') === tab));
  if (view !== viewDay) days.hidden = true;
  document.body.dataset.view = name || 'hoy';
  quietRender = quiet; liveNow = false;
  let ok = true;
  try {
    await view(...args.map(decodeURIComponent));
  } catch (err) {
    ok = false;
    console.error(err);
    const msg = navigator.onLine ? 'ESPN no mandó los datos de esta pantalla. Intenta en un momento.' : 'Sin conexión a internet. Revisa tu conexión.';
    if (!quiet) main.innerHTML = `<div class="empty"><p>${msg}</p><button class="btn" data-retry>Reintentar</button></div>`;
  }
  if (!quiet) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
  const every = REFRESH[routes[name] ? name : ''];
  if (ok && every) updatedAt = Date.now();
  showGoals();
  renderStatus(every);
  if (every) timer = setTimeout(() => { if (!document.hidden) route(true); }, (liveNow ? LIVE_REFRESH : every) * 1000);
}

// Header pill: live pulse or "actualizado hace X"; tapping it refreshes now.
function renderStatus(every = REFRESH[location.hash.replace(/^#\/?/, '').split('/')[0]]) {
  const el = $('#status');
  if (!every || !updatedAt) { el.hidden = true; return; }
  const secs = Math.round((Date.now() - updatedAt) / 1000);
  el.hidden = false;
  el.classList.toggle('live', liveNow);
  el.querySelector('span').textContent = (liveNow ? 'En vivo, ' : '') + (secs < 5 ? 'recién actualizado' : `hace ${secs < 60 ? secs + ' s' : Math.round(secs / 60) + ' min'}`);
}
setInterval(() => !document.hidden && renderStatus(), 5000);

// Remember each score; a higher total than last time means a goal just happened.
function trackScore(e, lg) {
  if (e.state === 'pre') return '';
  const key = `${e.home.score}-${e.away.score}`, prev = lastScore.get(e.id);
  lastScore.set(e.id, key);
  if (prev == null || prev === key) return '';
  const [ph, pa] = prev.split('-').map(Number), [h, a] = key.split('-').map(Number);
  if (h + a > ph + pa) newGoals.push({ e, lg, who: h > ph ? e.home.name : e.away.name });
  return ' flash';
}

function showGoals() {
  const g = newGoals.splice(0).at(-1);
  if (!g) return;
  const toast = $('#toast');
  toast.innerHTML = `<a href="#/partido/${esc(g.lg)}/${esc(g.e.id)}"><b>¡Gol de ${esc(g.who)}!</b> ${esc(g.e.home.name)} ${esc(g.e.home.score)}–${esc(g.e.away.score)} ${esc(g.e.away.name)}</a>`;
  toast.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { toast.hidden = true; }, 6000);
  navigator.vibrate?.(200);
}

/* ---------- events ---------- */

document.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.day) { day = new Date(t.dataset.day.replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3T12:00')); route(); }
  else if (t.id === 'status') { route(true); }
  else if (t.dataset.themeSet) { theme = t.dataset.themeSet; save('tema', theme); applyTheme(); viewSettings(); }
  else if (t.dataset.ics) { downloadIcs(t.dataset.ics); }
  else if (t.dataset.push != null) { togglePush(); }
  else if (t.dataset.clearImg != null) { pendingImg = null; renderChat(); }
  else if (t.dataset.follow) {
    const id = t.dataset.follow;
    favTeams = isFav(id) ? favTeams.filter(x => x.id !== id) : [...favTeams, { id, lg: t.dataset.lg, name: t.dataset.name, logo: t.dataset.logo }];
    save('favoritos', favTeams); syncPush(); route(true);
  }
  else if (t.dataset.unfav) { favTeams = favTeams.filter(x => x.id !== t.dataset.unfav); save('favoritos', favTeams); syncPush(); viewSettings(); }
  else if (t.dataset.filter != null) { dayFilter = t.dataset.filter; route(true); }
  else if (t.dataset.retry != null) { route(); }
  else if (t.dataset.back != null) { history.length > 1 ? history.back() : (location.hash = '#/'); }
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
});

// Coming back to the app after a while: jump to today and refresh.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (Date.now() - hiddenAt > 10 * 60e3 && !location.hash.startsWith('#/partido')) { day = new Date(); }
  if (Date.now() - hiddenAt > 5e3 && location.hash !== '#/ia') route(true); // back in the app: fresh data right away
});

window.addEventListener('hashchange', () => route());
route();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
