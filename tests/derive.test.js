import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFawaz, parseGoldApi, parseXausSpot, parseErApi, parseXausHistory, parseXausIntraday } from '../src/lib/api.js';
import { metalRows, karatPrices, fxCards, goldChart, convert } from '../src/lib/derive.js';
import { mergeMetals } from '../src/hooks/usePrices.js';

const fw = parseFawaz(JSON.parse(readFileSync(new URL('./fixture-fawaz-usd.json', import.meta.url))));

test('fawaz parse gives metals in USD/oz and EGP', () => {
  assert.ok(fw.usdEgp > 10 && fw.usdEgp < 200);
  assert.ok(fw.metals.XAU.usdOz > 1000, 'gold USD/oz');
  assert.ok(fw.metals.XAG.usdOz > 5 && fw.metals.XAG.usdOz < 500);
  assert.ok(fw.metals.XPT.usdOz > 100 && fw.metals.XPD.usdOz > 100);
});

test('other parsers', () => {
  assert.equal(parseGoldApi({ price: 4000.5, updatedAt: '2026-11-18T22:00:00Z' }).usdOz, 4000.5);
  const x = parseXausSpot({ spot_usd_oz: 4001, silver_usd_oz: 51 });
  assert.equal(x.XAU.usdOz, 4001); assert.equal(x.XAG.usdOz, 51);
  assert.equal(parseErApi({ rates: { EGP: 48, EUR: 0.9 }, time_last_update_unix: 1 }).usdEgp, 48);
  assert.equal(parseXausHistory({ data: { points: [{ d: '2026-11-17', c: 4000, h: 1, l: 1 }, { d: '2026-11-16', c: 3990 }] } })[0].usdOz, 3990);
  assert.equal(parseXausIntraday({ points: [{ t: 1795000000, p: 4000 }] })[0].t, 1795000000000);
  assert.throws(() => parseGoldApi({}));
});

test('merge prefers live and falls back to daily', () => {
  const m = mergeMetals({ XAU: { usdOz: 4000, at: 1 } }, { XAG: { usdOz: 50, at: 1 } }, fw);
  assert.equal(m.XAU.source, 'goldApi'); assert.equal(m.XAG.source, 'xaus');
  assert.equal(m.XPT.source, 'fawaz'); assert.equal(m.XPT.live, false);
});

test('conversions and karats', () => {
  const metals = { XAU: { usdOz: 3110.34768, live: true, at: Date.now() } };
  const fx = { usdEgp: 50, usdEur: 0.9, at: Date.now() };
  assert.equal(Math.round(convert(3110.34768, { unit: 'g', currency: 'EGP', usdEgp: 50 })), 5000);
  const k = karatPrices({ metals, fx, daily: [], currency: 'EGP' });
  assert.equal(Math.round(k.karats.find((x) => x.id === '21').price), 4375);
  assert.equal(Math.round(k.pound), 35000);
  const kp = karatPrices({ metals, fx, daily: [], currency: 'EGP', premium: 2 });
  assert.equal(Math.round(kp.karats[0].price), 5100);
});

test('changes vs previous day and fx cards', () => {
  const daily = [
    { date: '2026-11-17', usdEgp: 50, usdEur: 0.9, metals: { XAU: { usdOz: 3000 } } },
  ];
  const metals = { XAU: { usdOz: 3030, live: true, at: Date.parse('2026-11-18T12:00:00Z') } };
  const fx = { usdEgp: 50, usdEur: 0.9, at: Date.parse('2026-11-18T00:00:00Z') };
  const now = Date.parse('2026-11-18T12:00:00Z');
  const rows = metalRows({ metals, fx, daily, unit: 'g', currency: 'EGP', now });
  assert.equal(rows[0].change.toFixed(2), '1.00');
  assert.equal(rows[0].spark.length, 2);
  const cards = fxCards({ fx, daily, now });
  assert.equal(cards[1].value.toFixed(2), (50 / 0.9).toFixed(2));
  assert.equal(cards[0].change, 0);
  const ch = goldChart({ range: '1W', goldHistory: [], goldIntraday: [], daily, metals, fx, currency: 'EGP', purity: 1, now });
  assert.equal(ch.length, 2);
});

test('real fixture end to end', () => {
  const metals = mergeMetals({}, null, fw);
  const rows = metalRows({ metals, fx: { usdEgp: fw.usdEgp, usdEur: fw.usdEur, at: fw.at }, daily: [], unit: 'g', currency: 'EGP' });
  for (const r of rows) assert.ok(r.value > 0, r.code);
  console.log('fixture', fw.date, rows.map((r) => `${r.code} ${r.value.toFixed(2)} EGP/g`).join(' | '), 'USD/EGP', fw.usdEgp.toFixed(2));
});

test('unit switch applies to karats and chart', () => {
  const metals = { XAU: { usdOz: 3110.34768, live: true, at: Date.now() } };
  const fx = { usdEgp: 50, usdEur: 0.9, at: Date.now() };
  const g = karatPrices({ metals, fx, daily: [], currency: 'EGP', unit: 'g' });
  const kg = karatPrices({ metals, fx, daily: [], currency: 'EGP', unit: 'kg' });
  const oz = karatPrices({ metals, fx, daily: [], currency: 'EGP', unit: 'oz' });
  assert.equal(Math.round(kg.karats[0].price), Math.round(g.karats[0].price * 1000));
  assert.equal(Math.round(oz.karats[0].price), Math.round(3110.34768 * 50));
  assert.equal(Math.round(kg.pound), Math.round(g.pound)); // gold pound is a fixed 8 g coin
  const daily = [{ date: '2026-11-17', usdEgp: 50, usdEur: 0.9, metals: { XAU: { usdOz: 3000 } } }];
  const c = goldChart({ unit: 'kg', range: '1W', goldHistory: [], goldIntraday: [], daily, metals, fx, currency: 'EGP', purity: 1 });
  assert.equal(Math.round(c[c.length - 1].v), Math.round(g.karats[0].price * 1000));
});
