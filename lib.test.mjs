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
