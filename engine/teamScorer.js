/**
 * teamScorer — Team Score modular e transparente.
 *
 * Cada componente recebe as estatísticas do time (teamAnalyzer.computeTeamStats)
 * e devolve { score: 0..1, details? }. O score final é a soma ponderada:
 *
 *   Team Score = Σ peso_i × score_i      (pesos em scoringConfig.js, soma = 100)
 *
 * Para adicionar um componente (ex.: habilidades, movesets) basta registrar em
 * COMPONENTS e dar um peso em scoringConfig.weights.
 *
 * Ex.: const r = PTA.engine.calculateFinalTeamScore(ctx.resolve(keys), ctx);
 *      r.total               // 87
 *      r.components[0]       // { id:'offensive', label:'Ofensiva', points: 17.2, max: 20, ... }
 */
(function (PTA) {
  'use strict';

  const E = PTA.engine;

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  // === COMPONENTES ===

  /** Cobertura ofensiva via STAB contra os 18 tipos e contra as combinações reais do jogo. */
  function offensive(s, ctx, P, detail) {
    const T = ctx.types.length;
    function val(m) { return m >= 2 ? P.valueSuper : m >= 1 ? P.valueNeutral : m > 0 ? P.valueResisted : 0; }
    let single = 0;
    for (let t = 0; t < T; t++) single += val(s.bestVsType[t]);
    single /= T;
    let combo = 0, wsum = 0;
    for (let c = 0; c < ctx.combos.length; c++) {
      const w = ctx.comboWeight[c];
      if (!w) continue;
      combo += w * val(s.bestVsCombo[c]);
      wsum += w;
    }
    combo = wsum ? combo / wsum : 0;
    const score = P.singleTypeShare * single + (1 - P.singleTypeShare) * combo;
    if (!detail) return { score: score };
    const se = [], neutral = [], resisted = [];
    for (let t = 0; t < T; t++) {
      if (s.bestVsType[t] >= 2) se.push(ctx.types[t]);
      else if (s.bestVsType[t] >= 1) neutral.push(ctx.types[t]);
      else resisted.push(ctx.types[t]);
    }
    return {
      score: score,
      details: { singleTypeScore: single, comboScore: combo, superEffective: se, neutral: neutral, resisted: resisted },
      explain: 'STABs super efetivos contra ' + se.length + '/18 tipos; ' + Math.round(combo * 100) + '% de aproveitamento contra as combinações de tipo existentes no jogo.',
    };
  }

  /** Por tipo de ataque: (resistências + imunidades − fraquezas) / tamanho do time, ponderado pela frequência do tipo no jogo. */
  function defensive(s, ctx, P, detail) {
    const T = ctx.types.length, n = Math.max(1, s.size);
    let acc = 0;
    const perType = detail ? [] : null;
    for (let t = 0; t < T; t++) {
      const bal = (s.resist[t] + s.immune[t] - s.weak[t] - P.quadFactor * s.quad[t]) / n;
      const st = clamp01(P.base + P.slope * bal);
      acc += st * ctx.typeWeight[t];
      if (perType) perType.push({ type: ctx.types[t], score: st, weight: ctx.typeWeight[t] });
    }
    const score = s.size ? acc / ctx.typeWeightSum : 0;
    if (!detail) return { score: score };
    const worst = perType.slice().sort(function (a, b) { return a.score - b.score; }).slice(0, 3)
      .filter(function (x) { return x.score < P.base; });
    return {
      score: score,
      details: { perType: perType, worst: worst },
      explain: worst.length ? 'Tipos que mais derrubam a nota: ' + worst.map(function (w) { return PTA.data.types.meta[w.type].name; }).join(', ') + '.' : 'Nenhum tipo desequilibra a defesa do time.',
    };
  }

  /** Penaliza fraquezas empilhadas (ex.: 4 de 6 fracos a Ground) e fraquezas duplas. */
  function sharedWeaknesses(s, ctx, P, detail) {
    const T = ctx.types.length;
    let penalty = 0, quadTotal = 0;
    const stacked = detail ? [] : null;
    for (let t = 0; t < T; t++) {
      const w = s.weak[t], a = s.resist[t] + s.immune[t];
      let pt = 0;
      if (w >= P.stackFrom) pt += Math.pow(w - P.stackFrom + 1, P.stackExponent);
      if (w >= 2 && a === 0) pt += P.noAnswerPenalty;
      pt *= ctx.typeWeight[t];
      penalty += pt;
      quadTotal += s.quad[t];
      if (stacked && pt > 0) stacked.push({ type: ctx.types[t], weak: w, answers: a, penalty: pt });
    }
    penalty += P.quadPenalty * quadTotal;
    const score = s.size ? clamp01(1 - penalty / P.maxPenalty) : 0;
    if (!detail) return { score: score };
    stacked.sort(function (a, b) { return b.penalty - a.penalty; });
    return {
      score: score,
      details: { penalty: penalty, stacked: stacked, quadTotal: quadTotal },
      explain: stacked.length || quadTotal
        ? 'Penalidade ' + penalty.toFixed(1) + ' — ' + (stacked.length ? stacked.length + ' tipo(s) com fraquezas acumuladas' : 'sem fraquezas acumuladas') + (quadTotal ? ', ' + quadTotal + ' fraqueza(s) dupla(s)' : '') + '.'
        : 'Nenhuma fraqueza compartilhada relevante.',
    };
  }

  /** Para cada tipo de ataque, existe alguém que resiste/é imune? (1 resposta = 65%, 2 = 90%, 3+ = 100%). */
  function resistances(s, ctx, P, detail) {
    const T = ctx.types.length;
    let acc = 0;
    const uncovered = detail ? [] : null;
    for (let t = 0; t < T; t++) {
      const a = s.resist[t] + s.immune[t];
      const v = a === 0 ? 0 : a === 1 ? P.one : a === 2 ? P.two : P.threeOrMore;
      acc += v * ctx.typeWeight[t];
      if (uncovered && a === 0) uncovered.push(ctx.types[t]);
    }
    const score = acc / ctx.typeWeightSum;
    if (!detail) return { score: score };
    return {
      score: score,
      details: { uncovered: uncovered },
      explain: uncovered.length ? 'Sem nenhuma resistência contra: ' + uncovered.map(function (t) { return PTA.data.types.meta[t].name; }).join(', ') + '.' : 'Todos os 18 tipos têm pelo menos uma resposta defensiva.',
    };
  }

  /** Quantidade de imunidades distintas (e totais) no time. */
  function immunities(s, ctx, P, detail) {
    const T = ctx.types.length;
    let distinct = 0, total = 0;
    const list = detail ? [] : null;
    for (let t = 0; t < T; t++) {
      if (s.immune[t] > 0) { distinct++; if (list) list.push({ type: ctx.types[t], count: s.immune[t] }); }
      total += s.immune[t];
    }
    const score = P.distinctShare * clamp01(distinct / P.distinctTarget) + (1 - P.distinctShare) * clamp01(total / P.totalTarget);
    if (!detail) return { score: score };
    return {
      score: score,
      details: { distinct: distinct, total: total, list: list },
      explain: distinct ? distinct + ' imunidade(s) distinta(s): ' + list.map(function (x) { return PTA.data.types.meta[x.type].name + (x.count > 1 ? ' ×' + x.count : ''); }).join(', ') + '.' : 'O time não possui imunidades.',
    };
  }

  /**
   * Respostas às ameaças comuns do jogo (os Pokémon finais mais fortes).
   * Para cada ameaça, a melhor resposta do time vale:
   *   muralha (resiste aos STABs) 100% · counter (não é fraco e acerta super efetivo) 90%
   *   revenge (mais rápido e acerta super efetivo) 60% · neutro 35%.
   */
  function threats(s, ctx, P, detail) {
    const list = ctx.threats;
    if (!list.length || !s.size) return { score: s.size ? 1 : 0, details: detail ? { unanswered: [], answered: [] } : undefined };
    const C = ctx.combos.length;
    const avc = ctx.attackVsCombo;
    let acc = 0, wsum = 0;
    const unanswered = detail ? [] : null, answered = detail ? [] : null;
    for (let i = 0; i < list.length; i++) {
      const th = list[i].pokemon, w = list[i].weight;
      let best = 0, bestBy = null, weakCount = 0;
      for (let m = 0; m < s.size; m++) {
        const mem = s.members[m];
        if (mem.speciesId === th.speciesId) { best = 1; bestBy = mem; break; }
        let incoming = 0;
        for (let k = 0; k < th.typeIdx.length; k++) { const x = mem.profile[th.typeIdx[k]]; if (x > incoming) incoming = x; }
        let outgoing = 0;
        for (let k = 0; k < mem.typeIdx.length; k++) { const x = avc[mem.typeIdx[k] * C + th.comboIdx]; if (x > outgoing) outgoing = x; }
        if (incoming > 1) weakCount++;
        let q = 0;
        if (incoming < 1) q = outgoing >= 1 ? P.wall : P.wall * 0.85;
        else if (incoming <= 1 && outgoing >= 2) q = P.counter;
        else if (outgoing >= 2 && mem.stats[5] > th.stats[5]) q = P.revenge;
        else if (incoming <= 1) q = P.neutral;
        if (q > best) { best = q; bestBy = mem; }
      }
      acc += best * w;
      wsum += w;
      if (detail) {
        const rec = { key: th.key, name: th.name, quality: best, by: bestBy ? bestBy.key : null, weakCount: weakCount };
        (best < 0.5 ? unanswered : answered).push(rec);
      }
    }
    const score = acc / wsum;
    if (!detail) return { score: score };
    return {
      score: score,
      details: { unanswered: unanswered, answered: answered, total: list.length },
      explain: answered.length + ' de ' + list.length + ' ameaças comuns do jogo têm resposta' + (unanswered.length ? '; sem resposta clara: ' + unanswered.slice(0, 4).map(function (u) { return u.name; }).join(', ') + (unanswered.length > 4 ? '…' : '') : '') + '.',
    };
  }

  /** Diversidade de tipos: muitos tipos distintos, poucos tipos repetidos 3+ vezes, sem combinações duplicadas. */
  function diversity(s, ctx, P, detail) {
    if (!s.size) return { score: 0 };
    const T = ctx.types.length;
    let unique = 0, triples = 0, quads = 0;
    const repeated = detail ? [] : null;
    for (let t = 0; t < T; t++) {
      const c = s.typeCount[t];
      if (c > 0) unique++;
      if (c >= 3) triples++;
      if (c >= 4) quads++;
      if (repeated && c >= 2) repeated.push({ type: ctx.types[t], count: c });
    }
    const target = Math.min(P.maxUnique, P.perMemberUnique * s.size);
    const score = clamp01(Math.min(1, unique / target) - P.tripleTypePenalty * triples - P.quadTypePenalty * quads - P.dupComboPenalty * s.dupCombos);
    if (!detail) return { score: score };
    return {
      score: score,
      details: { unique: unique, repeated: repeated, dupCombos: s.dupCombos },
      explain: unique + ' tipos distintos' + (triples ? '; ' + triples + ' tipo(s) presente(s) em 3+ membros' : '') + (s.dupCombos ? '; ' + s.dupCombos + ' combinação(ões) repetida(s)' : '') + '.',
    };
  }

  /** Equilíbrio de funções a partir dos stats base: físico/especial, velocidade, bulk e poder relativo ao jogo. */
  function balance(s, ctx, P, detail) {
    if (!s.size) return { score: 0 };
    const r = s.roles;
    const mix = ((r.physical + r.mixed) > 0 ? 0.5 : 0) + ((r.special + r.mixed) > 0 ? 0.5 : 0);
    const speed = clamp01(r.fast / P.fastTarget);
    const bulk = (r.physBulk > 0 ? 0.5 : 0) + (r.specBulk > 0 ? 0.5 : 0);
    const power = clamp01((s.avgBst - ctx.bstRef.low) / Math.max(1, ctx.bstRef.high - ctx.bstRef.low));
    const score = P.mix * mix + P.speed * speed + P.bulk * bulk + P.power * power;
    if (!detail) return { score: score };
    return {
      score: score,
      details: { mix: mix, speed: speed, bulk: bulk, power: power, roles: r, avgBst: s.avgBst },
      explain: (r.physical + r.mixed) + ' atacante(s) físico(s), ' + (r.special + r.mixed) + ' especial(is), ' + r.fast + ' rápido(s), poder médio (BSR) ' + Math.round(s.avgBst) + '.',
    };
  }

  // === REGISTRO DE COMPONENTES ===
  const COMPONENTS = [
    { id: 'offensive', label: 'Ofensiva', short: 'OFE', fn: offensive, help: 'Quantos tipos (e combinações reais do jogo) o time acerta com vantagem usando os próprios tipos (STAB).' },
    { id: 'defensive', label: 'Defensiva', short: 'DEF', fn: defensive, help: 'Para cada tipo de ataque, compara resistências/imunidades com fraquezas. Tipos comuns no jogo pesam mais.' },
    { id: 'sharedWeaknesses', label: 'Fraquezas compartilhadas', short: 'FRQ', fn: sharedWeaknesses, help: 'Penaliza 3+ membros fracos ao mesmo tipo, tipos sem nenhuma resposta e fraquezas duplas (4×).' },
    { id: 'resistances', label: 'Resistências', short: 'RES', fn: resistances, help: 'Cada tipo de ataque deveria ter pelo menos um Pokémon que resiste ou é imune.' },
    { id: 'immunities', label: 'Imunidades', short: 'IMU', fn: immunities, help: 'Imunidades permitem trocas seguras. Conta imunidades distintas (Ground, Electric, Ghost...).' },
    { id: 'threats', label: 'Respostas a ameaças', short: 'AME', fn: threats, help: 'Para os ' + 40 + ' Pokémon finais mais fortes do jogo, existe alguém que resiste aos STABs ou os vence?' },
    { id: 'diversity', label: 'Diversidade', short: 'DIV', fn: diversity, help: 'Variedade de tipos e pouca redundância (tipos repetidos, combinações iguais).' },
    { id: 'balance', label: 'Equilíbrio de funções', short: 'FUN', fn: balance, help: 'Mistura de atacantes físicos/especiais, velocidade, bulk e poder (Base Stat Rating do Smogon) em relação ao jogo.' },
  ];

  /** Pesos atuais normalizados para somar 100. */
  function normalizedWeights(weights) {
    const w = weights || E.scoringConfig.weights;
    let sum = 0;
    COMPONENTS.forEach(function (c) { sum += Math.max(0, w[c.id] || 0); });
    const out = {};
    COMPONENTS.forEach(function (c) { out[c.id] = sum ? (Math.max(0, w[c.id] || 0) * 100) / sum : 0; });
    return out;
  }

  /**
   * Pontua estatísticas já calculadas.
   * opts: { weights, detail=false }
   */
  function scoreStats(stats, ctx, opts) {
    opts = opts || {};
    const weights = opts.normalizedWeights || normalizedWeights(opts.weights);
    const params = E.scoringConfig.params;
    let total = 0;
    const components = opts.detail ? [] : null;
    for (let i = 0; i < COMPONENTS.length; i++) {
      const c = COMPONENTS[i];
      const w = weights[c.id];
      if (!w && !opts.detail) continue;
      const r = c.fn(stats, ctx, params[c.id], !!opts.detail);
      total += w * r.score;
      if (components) components.push({ id: c.id, label: c.label, short: c.short, help: c.help, weight: w, max: w, score: r.score, points: w * r.score, details: r.details, explain: r.explain });
    }
    return { total: total, components: components };
  }

  /** Score rápido (número 0..100) — usado pelo gerador e pelas recomendações. */
  function quickScore(members, ctx, normWeights) {
    return scoreStats(E.computeTeamStats(members, ctx), ctx, { normalizedWeights: normWeights }).total;
  }

  // === API COM OS NOMES "DE NEGÓCIO" ===
  function componentFor(id) {
    const comp = COMPONENTS.filter(function (c) { return c.id === id; })[0];
    return function (members, ctx) {
      return comp.fn(E.computeTeamStats(members, ctx), ctx, E.scoringConfig.params[id], true);
    };
  }

  /**
   * Score completo com explicação de cada componente.
   * Ex.: calculateFinalTeamScore(ctx.resolve(keys), ctx) → { total: 87, raw: 86.7, components: [...] }
   */
  function calculateFinalTeamScore(members, ctx, weights) {
    const stats = E.computeTeamStats(members, ctx);
    const r = scoreStats(stats, ctx, { weights: weights, detail: true });
    return { total: Math.round(r.total), raw: r.total, components: r.components, stats: stats };
  }

  E.SCORE_COMPONENTS = COMPONENTS;
  E.normalizedWeights = normalizedWeights;
  E.scoreStats = scoreStats;
  E.quickScore = quickScore;
  E.calculateOffensiveCoverage = componentFor('offensive');
  E.calculateDefensiveCoverage = componentFor('defensive');
  E.calculateSharedWeaknesses = componentFor('sharedWeaknesses');
  E.calculateResistances = componentFor('resistances');
  E.calculateImmunities = componentFor('immunities');
  E.calculateThreatResponses = componentFor('threats');
  E.calculateTypeDiversity = componentFor('diversity');
  E.calculateTeamBalance = componentFor('balance');
  E.calculateTeamScore = function (members, ctx, weights) { return calculateFinalTeamScore(members, ctx, weights).total; };
  E.calculateFinalTeamScore = calculateFinalTeamScore;
})(PTA);
