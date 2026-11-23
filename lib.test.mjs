// Run: node lib.test.mjs
import assert from 'node:assert/strict';
import { datesAround, uniqueEvents, eventsForDay, statusLabel, simplifyStandings, moveItem } from './lib.js';

process.env.TZ = 'America/Mexico_City';
const ev = (id, date, name = 'STATUS_SCHEDULED', state = 'pre') => ({
  id, date, status: { displayClock: "67'", type: { name, state, shortDetail: 'x' } },
  competitions: [{ competitors: [
    { homeAway: 'home', score: '2', winner: true, team: { id: '1', displayName: 'América', logo: 'a.png' } },
    { homeAway: 'away', score: '1', team: { id: '2', displayName: 'Cruz Azul' } }] }],
});

// one request per day around the chosen day; duplicates across days are merged
assert.deepEqual(datesAround(new Date(2026, 10, 23)), ['20261122', '20261123', '20261124']);
assert.deepEqual(datesAround(new Date(2026, 11, 31), 0, 1), ['20261231', '20270101']);
assert.deepEqual(uniqueEvents([[{ id: 'x' }], [{ id: 'x' }, { id: 'y' }]]).map(e => e.id), ['x', 'y']);

// 02:00Z on the 24th is still the 23rd in Mexico City: it belongs to the 23rd, and order is by kickoff
const day = new Date(2026, 10, 23, 12);
const got = eventsForDay([ev('b', '2026-11-24T02:00Z'), ev('a', '2026-11-23T18:00Z'), ev('c', '2026-11-24T18:00Z')], day);
assert.deepEqual(got.map(e => e.id), ['a', 'b']);
assert.equal(got[0].home.name, 'América');
assert.equal(got[0].away.logo, '');

assert.equal(statusLabel({ displayClock: "67'", type: { name: 'STATUS_IN_PROGRESS', state: 'in' } }), "67'");
assert.equal(statusLabel({ displayClock: "45'", type: { name: 'STATUS_HALFTIME', state: 'in' } }), 'MT');
assert.equal(statusLabel({ type: { name: 'STATUS_FULL_TIME', state: 'post', shortDetail: 'FT' } }), 'Final');

const st = simplifyStandings({ children: [{ name: 'Tabla', standings: { entries: [
  { team: { displayName: 'B' }, note: { color: 'red;}' }, stats: [{ name: 'rank', displayValue: '2' }] },
  { team: { displayName: 'A' }, note: { color: '#81D6AC' }, stats: [{ name: 'rank', displayValue: '1' }, { name: 'points', displayValue: '33' }] }] } }] });
assert.deepEqual(st[0].rows.map(r => r.team), ['A', 'B']);
assert.equal(st[0].rows[0].zone, '#81D6AC');
assert.equal(st[0].rows[1].zone, '', 'non-hex colours from the API never reach a style attribute');

assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']);
assert.deepEqual(moveItem(['a', 'b'], 0, -1), ['a', 'b']);
console.log('ok');

// md(): HTML is escaped, tables/lists/bold render
import { md } from './lib.js';
assert.equal(md('<img src=x onerror=alert(1)>'), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
const t = md('**1X2**\n\n| Mercado | Prob |\n|---|---|\n| Local | 55% |\n\n- uno\n- dos');
assert.match(t, /<p><b>1X2<\/b><\/p>/);
assert.match(t, /<th>Mercado<\/th>.*<td>55%<\/td>/);
assert.ok(!t.includes('---'));
assert.match(t, /<ul><li>uno<\/li><li>dos<\/li><\/ul>/);
assert.equal(md('a\n\n---\n\nb'), '<p>a</p><hr><p>b</p>');
console.log('md ok');

import { pitchRows, decimalOdds, weatherText, pickPlace } from './lib.js';
// 4-4-2 as ESPN sends it (formationPlace order mixes lines)
const xi = ['G', 'RB', 'LB', 'CM', 'CD-R', 'CD-L', 'RM', 'LM', 'F', 'RF', 'LF'].map(pos => ({ pos }));
assert.deepEqual(pitchRows(xi).map(r => r.map(p => p.pos)), [['G'], ['LB', 'CD-L', 'CD-R', 'RB'], ['LM', 'CM', 'RM'], ['LF', 'F', 'RF']]);
assert.deepEqual(pitchRows([{ pos: 'DM' }, { pos: 'AM-L' }, { pos: 'G' }]).map(r => r.map(p => p.pos)), [['G'], ['DM'], ['AM-L']]);
assert.equal(decimalOdds(135).toFixed(2), '2.35');
assert.equal(decimalOdds(-150).toFixed(2), '1.67');
assert.equal(weatherText(63), 'Lluvia');
const towns = [{ name: 'Brentford', country: 'United States', population: 78 }, { name: 'Brentford', country: 'United Kingdom', admin1: 'England', population: 27000 }];
assert.equal(pickPlace(towns, 'England').country, 'United Kingdom');
assert.equal(pickPlace(towns, 'Narnia').population, 27000);
assert.equal(pickPlace([], 'Mexico'), undefined);
console.log('match helpers ok');

import { eventExtras } from './lib.js';
const ex = eventExtras({ competitions: [{ competitors: [{ homeAway: 'home', form: 'WWDWL' }, { homeAway: 'away', form: 'LLWDW' }],
  odds: [{ overUnder: 3.5, drawOdds: { moneyLine: 400 }, moneyline: { home: { close: { odds: '-195' } }, away: { close: { odds: 'EVEN' } } } }] }] });
assert.deepEqual(ex.form, { home: 'WWDWL', away: 'LLWDW' });
assert.equal(ex.odds.home.toFixed(2), '1.51');
assert.equal(ex.odds.draw, 5);
assert.equal(ex.odds.away, 2);
assert.equal(eventExtras({ competitions: [{}] }).odds, null);
console.log('extras ok');
