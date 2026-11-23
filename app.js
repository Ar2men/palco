import { LEAGUES, DEFAULT_LEAGUES, ymd, addDays, datesAround, uniqueEvents, eventsForDay,
  simplifyEvent, simplifyStandings, statusLabel, moveItem } from './lib.js';

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

  const box = Object.fromEntries((d.boxscore?.teams ?? []).map(t => [t.team.id, Object.fromEntries(t.statistics.map(s => [s.name, s.displayValue]))]));
  const hs = box[home.team.id] ?? {}, as = box[away.team.id] ?? {};
  const stats = STATS.filter(([k]) => hs[k] != null && as[k] != null).map(([k, label]) => {
    const a = parseFloat(hs[k]) || 0, b = parseFloat(as[k]) || 0, tot = a + b || 1;
    return `<li class="stat"><span>${esc(hs[k])}</span><span class="label">${label}</span><span>${esc(as[k])}</span>
      <span class="bar"><i style="width:${(a / tot) * 100}%"></i><i style="width:${(b / tot) * 100}%"></i></span></li>`;
  }).join('');

  const lineup = (d.rosters ?? []).map(r => {
    const list = (arr) => arr.map(p => `<li><span class="num">${esc(p.jersey)}</span>${esc(p.athlete?.displayName)}
      <span class="pos">${esc(p.position?.abbreviation)}</span>${p.subbedOut ? '<i class="out" aria-label="salió"></i>' : ''}${p.subbedIn ? '<i class="in" aria-label="entró"></i>' : ''}</li>`).join('');
    const starters = r.roster.filter(p => p.starter), subs = r.roster.filter(p => !p.starter);
    return `<div class="lineup"><h3>${img(r.team.logo || r.team.logos?.[0]?.href)} ${esc(r.team.shortDisplayName || r.team.displayName)} ${r.formation ? `<small>${esc(r.formation)}</small>` : ''}</h3>
      <ol>${list(starters)}</ol>${subs.length ? `<h4>Suplentes</h4><ol>${list(subs)}</ol>` : ''}</div>`;
  }).join('');

  const statusText = state === 'pre' ? `${fmtDay(new Date(comp.date))}, ${fmtTime(comp.date)}` : statusLabel(comp.status);
  const venue = d.gameInfo?.venue?.fullName;
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
    <div class="seg" role="tablist">
      <button role="tab" aria-selected="true" data-tab="resumen">Resumen</button>
      <button role="tab" aria-selected="false" data-tab="stats">Estadísticas</button>
      <button role="tab" aria-selected="false" data-tab="alineaciones">Alineaciones</button>
    </div>
    <section data-panel="resumen">${events ? `<ol class="timeline spoiler">${events}</ol>` : `<p class="note">${state === 'pre' ? 'El partido no ha empezado.' : 'Sin eventos todavía.'}</p>`}
      ${venue ? `<p class="venue">${esc(venue)}</p>` : ''}</section>
    <section data-panel="stats" hidden>${stats ? `<ul class="stats spoiler">${stats}</ul>` : '<p class="note">Las estadísticas aparecen cuando empieza el partido.</p>'}</section>
    <section data-panel="alineaciones" hidden>${lineup || '<p class="note">Las alineaciones se publican más o menos una hora antes del partido.</p>'}</section>
  </article>`;
  if (state === 'in') timer = setTimeout(() => !document.hidden && route(true), 30000);
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
    <p class="about">Palco no tiene anuncios, cuotas de apuestas, cuenta ni rastreo. Datos: API pública de ESPN.</p>
  </div>`;
}

const loading = () => `<div class="loading" role="status"><span></span><span></span><span></span><span class="sr">Cargando…</span></div>`;
const noLeagues = () => { main.innerHTML = `<div class="empty"><p>Elige las ligas que sigues.</p><a class="btn" href="#/ajustes">Elegir ligas</a></div>`; };

/* ---------- router ---------- */

const routes = { '': viewDay, proximos: viewUpcoming, tablas: viewTables, ajustes: viewSettings, partido: viewMatch };

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
    if (!quiet) main.innerHTML = `<div class="empty"><p>No se pudieron cargar los datos. Revisa tu conexión.</p><button class="btn" data-retry>Reintentar</button></div>`;
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
  }
  else if (t.dataset.move != null) { myLeagues = moveItem(myLeagues, +t.dataset.move, +t.dataset.delta); save('ligas', myLeagues); viewSettings(); }
  else if (t.dataset.remove) { myLeagues = myLeagues.filter(id => id !== t.dataset.remove); save('ligas', myLeagues); viewSettings(); }
  else if (t.dataset.add) { myLeagues = [...myLeagues, t.dataset.add]; save('ligas', myLeagues); viewSettings(); }
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
  if (Date.now() - hiddenAt > 30e3) route(true);
});

window.addEventListener('hashchange', () => route());
setSpoil(noSpoil);
route();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
