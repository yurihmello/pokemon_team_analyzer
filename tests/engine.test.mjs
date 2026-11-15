/**
 * Testes do motor (sem navegador): node tests/engine.test.mjs
 * Carrega os mesmos scripts do index.html num contexto Node.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Lê a lista de <script src> do index.html (fora de ui/ e app.js). */
function engineScripts() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1])
    .filter((s) => !s.startsWith('ui/') && s !== 'app.js');
}

const sandbox = { console, setTimeout, Date, Math };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const s of engineScripts()) vm.runInContext(fs.readFileSync(path.join(ROOT, s), 'utf8'), sandbox, { filename: s });
const { PTA } = sandbox;
const E = PTA.engine;

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (e) { console.log('  ✗', name); console.log(e); process.exitCode = 1; }
}

console.log('Motor de análise');

await test('tabela de tipos padrão', () => {
  const calc = E.createTypeCalculator(PTA.data.games['scarlet-violet']);
  assert.equal(calc.multiplier('ground', ['fire', 'flying']), 0);
  assert.equal(calc.multiplier('ice', ['dragon', 'ground']), 4);
  assert.equal(calc.multiplier('fire', ['water', 'dragon']), 0.25);
  assert.equal(calc.multiplier('dragon', ['fairy']), 0);
});

await test('Legends: Arceus usa 2,5× e 0,4×', () => {
  const calc = E.createTypeCalculator(PTA.data.games['legends-arceus']);
  assert.equal(calc.multiplier('ice', ['dragon', 'ground']), 2.5);
  assert.equal(calc.multiplier('fire', ['water', 'dragon']), 0.4);
  assert.equal(calc.multiplier('ground', ['fire', 'flying']), 0);
});

await test('disponibilidade respeita o jogo', () => {
  const za = E.createGameContext('legends-za');
  const la = E.createGameContext('legends-arceus');
  const sv = E.createGameContext('scarlet-violet');
  assert.ok(za.get('dragonite-mega'), 'Mega Dragonite em Z-A');
  assert.equal(sv.get('dragonite-mega'), null, 'SV não tem Megas');
  assert.ok(la.get('arcanine-hisui'), 'Arcanine de Hisui em LA');
  assert.equal(la.get('corviknight'), null, 'Corviknight não existe em LA');
  assert.equal(sv.get('ursaring').isFinal, false, 'Ursaring evolui em SV (Ursaluna)');
  const bdsp = E.createGameContext('brilliant-diamond-shining-pearl');
  assert.equal(bdsp.get('ursaring').isFinal, true, 'Ursaring é final em BDSP (sem Ursaluna)');
  assert.equal(E.createGameContext('sword-shield').get('ursaring'), null, 'Ursaring não existe em SwSh');
  const zaBase = E.createGameContext('legends-za', { packs: ['base'] });
  assert.equal(zaBase.get('raichu-mega-x'), null, 'Mega Raichu X é do DLC');
});

await test('análise e score de um time', () => {
  const ctx = E.createGameContext('scarlet-violet');
  const team = ctx.resolve(['feraligatr', 'haunter', 'charizard', 'lucario', 'dragonite', 'tyranitar']);
  assert.equal(team.length, 6);
  const a = E.analyzeTeam(team, ctx);
  const ground = a.defense[ctx.calc.index.ground];
  assert.equal(ground.weak, 3); // Feraligatr não; Lucario, Tyranitar e Haunter sim
  assert.equal(ground.immune, 2); // Charizard e Dragonite
  const s = E.calculateFinalTeamScore(team, ctx);
  console.log('     score exemplo:', s.total, s.components.map((c) => `${c.short}:${c.points.toFixed(1)}/${c.max.toFixed(0)}`).join(' '));
  assert.ok(s.total > 0 && s.total <= 100);
  const ins = E.buildInsights(a, s, ctx);
  assert.ok(ins.length > 0);
  ins.slice(0, 6).forEach((i) => console.log('    ', i.icon, i.title, '—', i.text));
});

await test('recomendações e substituições', () => {
  const ctx = E.createGameContext('scarlet-violet');
  const keys = ['feraligatr', 'haunter', 'charizard', 'lucario', 'dragonite', 'tyranitar'];
  const t0 = Date.now();
  const r = E.suggestReplacements(keys, ctx);
  console.log(`     ${Date.now() - t0} ms`);
  assert.ok(r.best.length > 0);
  r.best.slice(0, 3).forEach((x) => console.log(`     trocar ${x.removed.name} → ${x.candidate.name}: ${x.before.toFixed(1)} → ${x.after.toFixed(1)} | ${x.reasons.pros.join('; ')}`));
  const add = E.suggestAdditions(keys.slice(0, 4), ctx);
  add.items.slice(0, 3).forEach((x) => console.log(`     adicionar ${x.candidate.name}: +${x.delta.toFixed(1)} | ${x.reasons.pros.join('; ')}`));
  assert.ok(add.items.length > 0);
});

for (const gameId of ['scarlet-violet', 'legends-za', 'legends-arceus']) {
  await test(`gerador de times (${gameId})`, async () => {
    const ctx = E.createGameContext(gameId);
    const t0 = Date.now();
    const teams = await E.generateTeams(ctx, { count: 3 });
    console.log(`     ${Date.now() - t0} ms, ${teams[0].meta.evaluated} times avaliados, pool ${teams[0].meta.poolSize}`);
    teams.forEach((t) => console.log(`     #${t.rank} ${t.score} — ${t.keys.join(', ')}`));
    assert.equal(teams[0].keys.length, 6);
    assert.equal(ctx.validateTeam(ctx.resolve(teams[0].keys)).length, 0);
  });
}

await test('sessão: 10 times + mais 10, Megas sem limite', async () => {
  const ctx = E.createGameContext('legends-za', { rules: { maxMegasPerTeam: 6 } });
  const s = E.createGenerationSession(ctx, {});
  await s.run();
  const first = s.next(10);
  const more = await s.more(10);
  assert.equal(first.length, 10);
  assert.equal(more.length, 10);
  assert.ok(first[9].score >= more[9].score);
  const megas = first[0].keys.filter((k) => ctx.get(k).isMega).length;
  console.log(`     #1 com ${megas} Megas: ${first[0].keys.join(', ')}`);
  assert.equal(ctx.validateTeam(ctx.resolve(first[0].keys)).length, 0);
  const strict = E.createGameContext('legends-za');
  assert.ok(strict.validateTeam(strict.resolve(first[0].keys)).length > 0 || megas <= 1);
});

console.log(`\n${passed} testes passaram`);
