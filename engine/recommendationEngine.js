/**
 * recommendationEngine — sugestões de adição e substituição.
 *
 * Não usa regras fixas do tipo "falta Ground, sugira Ground": cada candidato do
 * pool do jogo é realmente testado no time e o novo Team Score é calculado.
 * Os motivos vêm da diferença entre as análises antes/depois.
 *
 * Ex.: const r = PTA.engine.suggestReplacements(['feraligatr','haunter',...], ctx);
 *      r.best[0] → { removed, candidate, before: 76, after: 87, delta: 11, reasons: [...] }
 */
(function (PTA) {
  'use strict';

  const E = PTA.engine;

  function tn(t) { return PTA.data.types.meta[t].name; }

  /**
   * Explica por que trocar/adicionar melhora (ou piora) o time.
   * Retorna { pros: [string], cons: [string], components: [{label, delta}] }
   */
  function explainChange(beforeMembers, afterMembers, ctx, added, removed) {
    const B = E.computeTeamStats(beforeMembers, ctx);
    const A = E.computeTeamStats(afterMembers, ctx);
    const pros = [], cons = [];
    const T = ctx.types.length;

    // Defesa: tipos em que o saldo (respostas − fraquezas) melhorou, priorizando onde havia problema.
    const defGains = [];
    for (let t = 0; t < T; t++) {
      const netB = B.resist[t] + B.immune[t] - B.weak[t];
      const netA = A.resist[t] + A.immune[t] - A.weak[t];
      const problem = B.weak[t] - (B.resist[t] + B.immune[t]);
      if (netA > netB) defGains.push({ t: t, problem: problem, gain: netA - netB });
      else if (netA < netB && A.weak[t] >= 2 && A.weak[t] > A.resist[t] + A.immune[t]) {
        cons.push('Aumenta a exposição a ' + tn(ctx.types[t]) + ' (' + B.weak[t] + ' → ' + A.weak[t] + ' fracos)');
      }
    }
    defGains.sort(function (a, b) { return (b.problem - a.problem) || (ctx.typeWeight[b.t] - ctx.typeWeight[a.t]); });
    defGains.slice(0, 4).forEach(function (g) {
      const type = tn(ctx.types[g.t]);
      const ctxText = B.weak[g.t] > 0 ? ' (seu time tinha ' + B.weak[g.t] + ' fraco' + (B.weak[g.t] > 1 ? 's' : '') + ')' : '';
      if (added && added.profile[g.t] === 0) pros.push('Imune a ' + type + ctxText);
      else if (added && added.profile[g.t] < 1) pros.push('Resiste a ' + type + ctxText);
      else if (removed && removed.profile[g.t] > 1) pros.push('Remove uma fraqueza a ' + type);
      else pros.push('Melhora a defesa contra ' + type);
    });

    // Ofensiva (STAB).
    const newSe = [], lostSe = [];
    for (let t = 0; t < T; t++) {
      if (B.bestVsType[t] < 2 && A.bestVsType[t] >= 2) newSe.push(tn(ctx.types[t]));
      if (B.bestVsType[t] >= 2 && A.bestVsType[t] < 2) lostSe.push(tn(ctx.types[t]));
    }
    if (newSe.length) pros.push('Passa a acertar super efetivo: ' + newSe.join(', '));
    if (lostSe.length) cons.push('Perde STAB super efetivo contra ' + lostSe.join(', '));

    // Ameaças respondidas.
    const P = E.scoringConfig.params.threats;
    const thB = E.SCORE_COMPONENTS.filter(function (c) { return c.id === 'threats'; })[0].fn(B, ctx, P, true).details;
    const thA = E.SCORE_COMPONENTS.filter(function (c) { return c.id === 'threats'; })[0].fn(A, ctx, P, true).details;
    if (thB && thA) {
      const before = new Set(thB.unanswered.map(function (u) { return u.key; }));
      const after = new Set(thA.unanswered.map(function (u) { return u.key; }));
      const solved = thB.unanswered.filter(function (u) { return !after.has(u.key); }).map(function (u) { return u.name; });
      const created = thA.unanswered.filter(function (u) { return !before.has(u.key); }).map(function (u) { return u.name; });
      if (solved.length) pros.push('Responde a ' + solved.slice(0, 3).join(', ') + (solved.length > 3 ? ' +' + (solved.length - 3) : ''));
      if (created.length) cons.push('Deixa sem resposta: ' + created.slice(0, 3).join(', '));
    }

    // Funções.
    const rb = B.roles, ra = A.roles;
    if (rb.special + rb.mixed === 0 && ra.special + ra.mixed > 0) pros.push('Adiciona um atacante especial');
    if (rb.physical + rb.mixed === 0 && ra.physical + ra.mixed > 0) pros.push('Adiciona um atacante físico');
    if (ra.fast > rb.fast && rb.fast < 2) pros.push('Aumenta a velocidade do time');
    if (A.avgBst - B.avgBst >= 30 && afterMembers.length === beforeMembers.length) pros.push('Aumenta o poder do time (BSR médio ' + Math.round(B.avgBst) + ' → ' + Math.round(A.avgBst) + ')');

    // Diferença por componente do score.
    const sB = E.scoreStats(B, ctx, { detail: true }).components;
    const sA = E.scoreStats(A, ctx, { detail: true }).components;
    const components = sA.map(function (c, i) { return { id: c.id, label: c.label, delta: c.points - sB[i].points }; })
      .filter(function (c) { return Math.abs(c.delta) >= 0.5; })
      .sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });

    return { pros: pros.slice(0, 6), cons: cons.slice(0, 3), components: components };
  }

  /** Filtro opcional por tipo (opts.type). */
  function filterPool(pool, opts) {
    return opts.type ? pool.filter(function (p) { return p.types.indexOf(opts.type) !== -1; }) : pool;
  }

  /** Mantém só a melhor forma de cada espécie e limita o tamanho da lista. */
  function topDistinct(items, n, keyFn) {
    const seen = new Set(), out = [];
    for (let i = 0; i < items.length && out.length < n; i++) {
      const k = keyFn(items[i]);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(items[i]);
    }
    return out;
  }

  /**
   * Melhores Pokémon para ADICIONAR (time com menos de 6).
   * opts: { limit=8, includeLegendary, includeMega, finalsOnly, weights }
   */
  function suggestAdditions(teamKeys, ctx, opts) {
    opts = opts || {};
    const members = ctx.resolve(teamKeys);
    const teamSize = ctx.rules.teamSize || 6;
    if (members.length >= teamSize) return { baseScore: null, items: [] };
    const nw = E.normalizedWeights(opts.weights);
    const base = E.quickScore(members, ctx, nw);
    const pool = filterPool(ctx.candidatePool(opts), opts).filter(function (c) { return ctx.canJoin(members, c); });
    const scored = pool.map(function (c) {
      return { candidate: c, score: E.quickScore(members.concat([c]), ctx, nw) };
    }).sort(function (a, b) { return b.score - a.score || b.candidate.power - a.candidate.power; });
    const items = topDistinct(scored, opts.limit || 8, function (x) { return x.candidate.speciesId; }).map(function (x) {
      const after = members.concat([x.candidate]);
      return {
        type: 'add', candidate: x.candidate, removed: null,
        before: base, after: x.score, delta: x.score - base,
        teamAfter: after.map(function (p) { return p.key; }),
        reasons: explainChange(members, after, ctx, x.candidate, null),
      };
    });
    return { baseScore: base, items: items };
  }

  /**
   * Melhores SUBSTITUIÇÕES: testa trocar cada membro por cada candidato do pool.
   * opts: { limit=6, perMember=3, type, includeLegendary, includeMega, weights }
   * Retorna { baseScore, best: [...], perMember: { key: [melhores trocas] } }
   */
  function suggestReplacements(teamKeys, ctx, opts) {
    opts = opts || {};
    const members = ctx.resolve(teamKeys);
    if (!members.length) return { baseScore: null, best: [], perMember: {} };
    const nw = E.normalizedWeights(opts.weights);
    const base = E.quickScore(members, ctx, nw);
    const pool = filterPool(ctx.candidatePool(opts), opts);
    const all = [];
    const perMember = {};
    const perMemberCount = opts.perMember || 3;
    members.forEach(function (m, i) {
      const mine = [];
      pool.forEach(function (c) {
        if (!ctx.canJoin(members, c, m.key)) return;
        const team = members.slice();
        team[i] = c;
        const s = E.quickScore(team, ctx, nw);
        const rec = { removed: m, candidate: c, score: s, index: i };
        all.push(rec);
        mine.push(rec);
      });
      mine.sort(function (a, b) { return b.score - a.score; });
      perMember[m.key] = topDistinct(mine, perMemberCount, function (x) { return x.candidate.speciesId; });
    });
    all.sort(function (a, b) { return b.score - a.score; });

    function materialize(x) {
      const after = members.slice();
      after[x.index] = x.candidate;
      return {
        type: 'replace', candidate: x.candidate, removed: x.removed,
        before: base, after: x.score, delta: x.score - base,
        teamAfter: after.map(function (p) { return p.key; }),
        reasons: explainChange(members, after, ctx, x.candidate, x.removed),
      };
    }
    const best = topDistinct(all.filter(function (x) { return x.score > base; }), opts.limit || 6,
      function (x) { return x.candidate.speciesId; }).map(materialize);
    const perMemberOut = {};
    Object.keys(perMember).forEach(function (k) { perMemberOut[k] = perMember[k].map(materialize); });
    return { baseScore: base, best: best, perMember: perMemberOut };
  }

  /**
   * Dados para a comparação visual ANTES × DEPOIS.
   * Ex.: compareTeams(['a','b'], ['a','c'], ctx) → { before, after, changedTypes }
   */
  function compareTeams(beforeKeys, afterKeys, ctx, weights) {
    function full(keys) {
      const m = ctx.resolve(keys);
      return { keys: keys, analysis: E.analyzeTeam(m, ctx), score: E.calculateFinalTeamScore(m, ctx, weights) };
    }
    const before = full(beforeKeys), after = full(afterKeys);
    const changedTypes = ctx.types.filter(function (t, i) {
      const b = before.analysis.defense[i], a = after.analysis.defense[i];
      return b.weak !== a.weak || b.answers !== a.answers || b.immune !== a.immune;
    });
    return { before: before, after: after, changedTypes: changedTypes };
  }

  E.explainChange = explainChange;
  E.suggestAdditions = suggestAdditions;
  E.suggestReplacements = suggestReplacements;
  E.compareTeams = compareTeams;
})(PTA);
