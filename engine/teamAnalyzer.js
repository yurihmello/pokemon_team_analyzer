/**
 * teamAnalyzer — transforma um time em números brutos (sem pontuação).
 *
 * computeTeamStats(members, ctx): versão rápida, usada milhares de vezes pelo gerador.
 * analyzeTeam(members, ctx):      versão detalhada para a interface (quem é fraco a quê, etc).
 *
 * `members` é uma lista de Pokémon do contexto (ctx.get(key)).
 *
 * Ex.: const stats = PTA.engine.computeTeamStats(ctx.resolve(['garchomp','corviknight']), ctx);
 *      stats.weak[ctx.calc.index.ice]  // → 2
 */
(function (PTA) {
  'use strict';

  /** Estatísticas numéricas do time (rápido, sem textos). */
  function computeTeamStats(members, ctx) {
    const T = ctx.types.length;
    const C = ctx.combos.length;
    const n = members.length;
    const dw = ctx.calc.doubleWeakThreshold;

    const weak = new Int8Array(T), resist = new Int8Array(T), immune = new Int8Array(T);
    const neutral = new Int8Array(T), quad = new Int8Array(T);
    const typeCount = new Int8Array(T);
    const stab = new Uint8Array(T);

    for (let i = 0; i < n; i++) {
      const prof = members[i].profile;
      for (let t = 0; t < T; t++) {
        const m = prof[t];
        if (m === 0) immune[t]++;
        else if (m > 1) { weak[t]++; if (m >= dw) quad[t]++; }
        else if (m < 1) resist[t]++;
        else neutral[t]++;
      }
      const ti = members[i].typeIdx;
      for (let k = 0; k < ti.length; k++) { typeCount[ti[k]]++; stab[ti[k]] = 1; }
    }

    // Ofensiva via STAB: melhor multiplicador contra cada tipo puro e contra cada combinação do jogo.
    const stabList = [];
    for (let t = 0; t < T; t++) if (stab[t]) stabList.push(t);
    const bestVsType = new Float32Array(T);
    for (let d = 0; d < T; d++) {
      let best = 0;
      for (let k = 0; k < stabList.length; k++) {
        const m = ctx.calc.single(ctx.types[stabList[k]], ctx.types[d]);
        if (m > best) best = m;
      }
      bestVsType[d] = best;
    }
    const bestVsCombo = new Float32Array(C);
    const avc = ctx.attackVsCombo;
    for (let k = 0; k < stabList.length; k++) {
      const off = stabList[k] * C;
      for (let c = 0; c < C; c++) if (avc[off + c] > bestVsCombo[c]) bestVsCombo[c] = avc[off + c];
    }

    // Papéis e poder.
    let physical = 0, special = 0, mixed = 0, fast = 0, physBulk = 0, specBulk = 0, bstSum = 0, megas = 0;
    const combosSeen = {};
    let dupCombos = 0;
    for (let i = 0; i < n; i++) {
      const p = members[i], r = p.roles;
      if (r.physical) physical++;
      if (r.special) special++;
      if (r.mixed) mixed++;
      if (r.fast) fast++;
      if (r.physBulk) physBulk++;
      if (r.specBulk) specBulk++;
      if (p.isMega) megas++;
      bstSum += p.power;
      if (combosSeen[p.comboKey]) dupCombos++;
      combosSeen[p.comboKey] = true;
    }

    return {
      size: n, members: members,
      weak: weak, resist: resist, immune: immune, neutral: neutral, quad: quad,
      typeCount: typeCount, stabList: stabList,
      bestVsType: bestVsType, bestVsCombo: bestVsCombo,
      roles: { physical: physical, special: special, mixed: mixed, fast: fast, physBulk: physBulk, specBulk: specBulk },
      avgBst: n ? bstSum / n : 0,
      megas: megas,
      dupCombos: dupCombos,
    };
  }

  /**
   * Análise detalhada para a interface.
   * Retorna stats + tabelas por tipo com os membros envolvidos.
   */
  function analyzeTeam(members, ctx) {
    const stats = computeTeamStats(members, ctx);
    const types = ctx.types;

    const defense = types.map(function (t, i) {
      return {
        type: t,
        weak: stats.weak[i], resist: stats.resist[i], immune: stats.immune[i],
        neutral: stats.neutral[i], quad: stats.quad[i],
        answers: stats.resist[i] + stats.immune[i],
        members: members.map(function (p) { return { key: p.key, mult: p.profile[i] }; }),
      };
    });

    const offense = types.map(function (t, i) {
      const hitters = members.filter(function (p) {
        return p.types.some(function (a) { return ctx.calc.single(a, t) >= 2; });
      }).map(function (p) { return p.key; });
      return { type: t, best: stats.bestVsType[i], hitters: hitters };
    });

    let seW = 0, neuW = 0, resW = 0, total = 0;
    for (let c = 0; c < ctx.combos.length; c++) {
      const w = ctx.comboWeight[c];
      if (!w) continue;
      total += w;
      const b = stats.bestVsCombo[c];
      if (b >= 2) seW += w; else if (b >= 1) neuW += w; else resW += w;
    }

    return {
      stats: stats,
      members: members,
      defense: defense,
      offense: offense,
      comboCoverage: {
        superEffective: total ? seW / total : 0,
        neutral: total ? neuW / total : 0,
        resisted: total ? resW / total : 0,
        combos: ctx.combos.filter(function (c) { return c.count > 0; }).length,
      },
      validation: ctx.validateTeam(members),
    };
  }

  PTA.engine.computeTeamStats = computeTeamStats;
  PTA.engine.analyzeTeam = analyzeTeam;
})(PTA);
