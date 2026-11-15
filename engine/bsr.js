/**
 * bsr — Base Stat Rating (BSR), a métrica de "poder" por stats base mais conhecida
 * da comunidade competitiva.
 *
 * Criada por X-Act para o projeto CAP do Smogon (artigo "Stat Ratings":
 * https://www.smogon.com/cap/articles/stat_ratings). Esta é uma tradução para JS da
 * implementação de referência em TypeScript de Quanyails (MIT):
 * https://github.com/Quanyails/pokemon-bsr
 *
 * Ideia: em vez de somar os stats (BST), mede o quanto o Pokémon é bom em
 *   - Physical/Special Sweepiness (PS/SS): ataque × velocidade relativa ao metagame
 *   - Physical/Special Tankiness  (PT/ST): HP × defesa
 * Cada um vira um z-score relativo ao METAGAME (aqui: os Pokémon finais do jogo
 * selecionado), e o BSR é a soma normalizada dos quatro.
 *
 * Escala "bonita" (igual à da referência):
 *   PS/PT/SS/ST → média 100, desvio 50   ·   BSR → média 200, desvio 100
 *
 * Ex.: const calc = PTA.engine.createBsrCalculator(listaDeStats);
 *      calc.rate([108,130,95,80,85,102])  // Garchomp → { bsr: ~330, ps, pt, ss, st }
 */
(function (PTA) {
  'use strict';

  const EXPECTED_ATTACK = 120 + 1 / 3;  // ataque base "esperado" do metagame (referência)
  const EXPECTED_TURNS_TO_KO = 1.5;

  function mean(xs) { let s = 0; for (let i = 0; i < xs.length; i++) s += xs[i]; return xs.length ? s / xs.length : 0; }
  function stdev(xs) {
    if (xs.length < 2) return 1;
    const m = mean(xs);
    let s = 0;
    for (let i = 0; i < xs.length; i++) s += (xs[i] - m) * (xs[i] - m);
    return Math.sqrt(s / (xs.length - 1)) || 1;   // desvio amostral, como na referência
  }
  function zScorer(xs) { const m = mean(xs), sd = stdev(xs); return function (x) { return (x - m) / sd; }; }

  /**
   * Cria a calculadora a partir dos stats base do metagame.
   * statsList: lista de [hp, atk, def, spa, spd, spe]
   */
  function createBsrCalculator(statsList) {
    const n = statsList.length || 1;
    // Fator de velocidade: fração do metagame que este Pokémon ultrapassa ou empata.
    const speeds = statsList.map(function (s) { return s[5]; }).sort(function (a, b) { return a - b; });
    function speedFactor(spe) {
      let lo = 0, hi = speeds.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (speeds[mid] <= spe) lo = mid + 1; else hi = mid; }
      return lo / n;
    }
    // Stats efetivos no nível 100, IV 31, sem EVs, natureza neutra.
    function effective(s) {
      return { hp: s[0] * 2 + 141, atk: s[1] * 2 + 36, def: s[2] * 2 + 36, spa: s[3] * 2 + 36, spd: s[4] * 2 + 36, spe: speedFactor(s[5]) };
    }
    const stalliness = (EXPECTED_ATTACK * 2 + 36) * EXPECTED_TURNS_TO_KO;
    function sweepiness(a, spe) { return (a * (a * spe + stalliness)) / (a * (1 - spe) + stalliness); }
    function absolute(s) {
      const e = effective(s);
      return { ps: sweepiness(e.atk, e.spe), pt: e.hp * e.def, ss: sweepiness(e.spa, e.spe), st: e.hp * e.spd };
    }

    const abs = statsList.map(absolute);
    const zPs = zScorer(abs.map(function (r) { return r.ps; }));
    const zPt = zScorer(abs.map(function (r) { return r.pt; }));
    const zSs = zScorer(abs.map(function (r) { return r.ss; }));
    const zSt = zScorer(abs.map(function (r) { return r.st; }));
    function normalized(s) { const r = absolute(s); return { ps: zPs(r.ps), pt: zPt(r.pt), ss: zSs(r.ss), st: zSt(r.st) }; }
    const zOr = zScorer(statsList.map(function (s) { const r = normalized(s); return r.ps + r.pt + r.ss + r.st; }));

    /** Avalia um conjunto de stats base. */
    function rate(stats) {
      const r = normalized(stats);
      return {
        bsr: Math.round(200 + zOr(r.ps + r.pt + r.ss + r.st) * 100),
        ps: Math.round(100 + r.ps * 50), pt: Math.round(100 + r.pt * 50),
        ss: Math.round(100 + r.ss * 50), st: Math.round(100 + r.st * 50),
      };
    }
    return { rate: rate };
  }

  PTA.engine.createBsrCalculator = createBsrCalculator;
})(PTA);
