/**
 * teamGenerator — encontra times de 6 que maximizam o Team Score.
 *
 * Espaço de busca: com ~250 candidatos, C(250, 6) ≈ 3×10¹¹ times → força bruta inviável.
 * Por isso toda busca usa SEMPRE a configuração completa abaixo (não há "modo rápido"):
 *
 *  1. REDUÇÃO DO POOL — por combinação de tipos mantém até 5 representantes (papéis
 *     diferentes e maior poder). Mesmos tipos = mesmo perfil defensivo, então quase nada se perde.
 *  2. BEAM SEARCH — monta os times membro a membro, guardando os 64 melhores parciais.
 *     Todos os times completos avaliados no último passo entram no "banco de resultados".
 *  3. BUSCA LOCAL (hill climbing) — a partir dos melhores do beam e de vários times
 *     aleatórios, troca cada membro pelo melhor candidato enquanto o score subir.
 *  4. SELEÇÃO DIVERSA — os resultados são entregues em páginas (ex.: 10 por vez), em ordem
 *     de score, sem repetir times que compartilhem mais de `maxShared` membros.
 *  5. EXPANSÃO — quando o banco não tem mais times diversos, novas buscas locais partem de
 *     perturbações dos times já mostrados (busca local iterada) e de novos times aleatórios.
 *
 * Uso:
 *   const s = PTA.engine.createGenerationSession(ctx, { includeMega: true });
 *   await s.run(onProgress);
 *   const first10 = s.next(10);
 *   const more = await s.more(10, onProgress);   // 11º ao 20º
 */
(function (PTA) {
  'use strict';

  const E = PTA.engine;

  // === PARÂMETROS DA BUSCA (fixos: busca sempre completa) ===
  const SEARCH = {
    perCombo: 5,          // representantes por combinação de tipos
    beamWidth: 64,        // times parciais mantidos em cada passo
    localSearchTeams: 24, // melhores do beam refinados por busca local
    randomRestarts: 16,   // times aleatórios refinados por busca local
    expandRestarts: 12,   // novas buscas locais a cada expansão
    maxPasses: 4,         // passes de busca local por time
    maxShared: 3,         // máximo de membros em comum entre resultados (fora os fixos)
  };

  // === OBJETIVOS DE BUSCA ===
  // Cada objetivo é só um conjunto de pesos para o MESMO scorer. O time é sempre exibido
  // também com o Team Score normal (pesos do usuário), para comparação.
  const OBJECTIVES = {
    score: { label: 'Maior Team Score', weights: null },
    coverage: {
      label: 'Maior cobertura de tipos',
      weights: { offensive: 55, diversity: 10, threats: 10, defensive: 8, sharedWeaknesses: 7, resistances: 5, immunities: 2, balance: 3 },
    },
    defense: {
      label: 'Mais resistente',
      weights: { defensive: 22, sharedWeaknesses: 24, resistances: 22, immunities: 14, threats: 8, offensive: 4, diversity: 2, balance: 4 },
    },
  };

  /** PRNG determinístico (mulberry32). */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function yieldToUI() { return new Promise(function (r) { setTimeout(r, 0); }); }

  /** Mantém os melhores representantes de cada combinação de tipos. */
  function reducePool(pool, perCombo) {
    const groups = new Map();
    pool.forEach(function (p) {
      if (!groups.has(p.comboKey)) groups.set(p.comboKey, []);
      groups.get(p.comboKey).push(p);
    });
    const out = [];
    groups.forEach(function (list) {
      list.sort(function (a, b) { return b.power - a.power || a.id - b.id; });
      const picked = [], roles = new Set();
      list.forEach(function (p) {
        if (picked.length < perCombo && !roles.has(p.roles.label)) { picked.push(p); roles.add(p.roles.label); }
      });
      list.forEach(function (p) { if (picked.length < perCombo && picked.indexOf(p) === -1) picked.push(p); });
      picked.forEach(function (p) { out.push(p); });
    });
    return out;
  }

  function teamKey(members) {
    return members.map(function (p) { return p.key; }).sort().join('|');
  }

  /**
   * Cria uma sessão de geração.
   * opts: { objective='score'|'coverage'|'defense', includeLegendary=false, includeMega=true,
   *         finalsOnly=true, skipWeak=true, locked=[keys], exclude=[keys], seed=1, weights }
   */
  function createGenerationSession(ctx, opts) {
    opts = opts || {};
    const teamSize = ctx.rules.teamSize || 6;
    const random = rng(opts.seed || 1);
    const objective = OBJECTIVES[opts.objective] ? opts.objective : 'score';
    const nw = E.normalizedWeights(OBJECTIVES[objective].weights || opts.weights);
    const locked = ctx.resolve(opts.locked || []).slice(0, teamSize);
    const lockedKeys = new Set(locked.map(function (p) { return p.key; }));
    const exclude = new Set(opts.exclude || []);

    const pool = reducePool(ctx.candidatePool({
      finalsOnly: opts.finalsOnly !== false,
      includeLegendary: !!opts.includeLegendary,
      includeMega: opts.includeMega !== false,
      exclude: exclude,
      minPower: opts.skipWeak === false ? 0 : ctx.bstRef.low,
    }), SEARCH.perCombo).filter(function (p) { return !lockedKeys.has(p.key); });
    if (pool.length + locked.length < teamSize) throw new Error('Pokémon insuficientes no pool para formar um time. Desmarque alguns filtros.');

    const scores = new Map();        // cache de todos os times avaliados
    const complete = new Map();      // banco de times completos: key → { members, score }
    const shown = [];                // times já entregues (em ordem)
    const shownKeys = new Set();
    let evaluated = 0, elapsedMs = 0, ranked = null;

    function score(members) {
      const k = teamKey(members);
      let s = scores.get(k);
      if (s === undefined) {
        s = E.quickScore(members, ctx, nw);
        scores.set(k, s);
        evaluated++;
        if (members.length === teamSize) { complete.set(k, { key: k, members: members.slice(), score: s }); ranked = null; }
      }
      return s;
    }

    // Progresso: estimativa de avaliações para a barra.
    let expected = 1, base = 0, lastYield = 0, progress = function () {};
    async function tick(phase) {
      if (Date.now() - lastYield > 40) {
        progress({ phase: phase, percent: Math.min(99, Math.round(((evaluated - base) / expected) * 100)), evaluated: evaluated });
        await yieldToUI();
        lastYield = Date.now();
      }
    }

    /** Busca local: troca cada membro (não fixo) pelo melhor candidato enquanto melhorar. */
    async function hillClimb(members, phase) {
      const current = members.slice();
      let currentScore = score(current), improved = true, passes = 0;
      while (improved && passes < SEARCH.maxPasses) {
        improved = false;
        passes++;
        for (let i = 0; i < current.length; i++) {
          if (lockedKeys.has(current[i].key)) continue;
          let bestS = currentScore, bestC = null;
          for (let c = 0; c < pool.length; c++) {
            const cand = pool[c];
            if (!ctx.canJoin(current, cand, current[i].key)) continue;
            const team = current.slice();
            team[i] = cand;
            const s = score(team);
            if (s > bestS + 1e-9) { bestS = s; bestC = cand; }
          }
          if (bestC) { current[i] = bestC; currentScore = bestS; improved = true; }
          await tick(phase);
        }
      }
      return current;
    }

    /** Completa um time (a partir de `start`) com candidatos aleatórios válidos. */
    function fillRandom(start) {
      const team = start.slice();
      let guard = 0;
      while (team.length < teamSize && guard++ < 2000) {
        const cand = pool[Math.floor(random() * pool.length)];
        if (ctx.canJoin(team, cand)) team.push(cand);
      }
      return team;
    }

    /** Perturba um time: troca `k` membros não fixos por aleatórios. */
    function perturb(members, k) {
      const free = members.filter(function (p) { return !lockedKeys.has(p.key); });
      for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); const t = free[i]; free[i] = free[j]; free[j] = t; }
      return fillRandom(locked.concat(free.slice(k)));
    }

    /** Busca inicial completa (beam search + buscas locais). */
    async function run(onProgress) {
      const t0 = Date.now();
      progress = onProgress || function () {};
      base = evaluated;
      const steps = teamSize - locked.length;
      expected = steps * SEARCH.beamWidth * pool.length + (SEARCH.localSearchTeams + SEARCH.randomRestarts) * 1.5 * steps * pool.length;

      let beam = [{ members: locked }];
      for (let step = 0; step < steps; step++) {
        const next = new Map();
        for (let b = 0; b < beam.length; b++) {
          const bm = beam[b].members;
          for (let c = 0; c < pool.length; c++) {
            const cand = pool[c];
            if (!ctx.canJoin(bm, cand)) continue;
            const team = bm.concat([cand]);
            const k = teamKey(team);
            if (!next.has(k)) next.set(k, { members: team, score: score(team) });
          }
          await tick('Beam search, ' + (locked.length + step + 1) + 'º membro');
        }
        beam = Array.from(next.values()).sort(function (a, b) { return b.score - a.score; }).slice(0, SEARCH.beamWidth);
      }
      const seeds = beam.slice(0, SEARCH.localSearchTeams).map(function (b) { return b.members; });
      for (let i = 0; i < SEARCH.randomRestarts; i++) seeds.push(fillRandom(locked));
      for (let i = 0; i < seeds.length; i++) await hillClimb(seeds[i], 'Busca local ' + (i + 1) + '/' + seeds.length);
      elapsedMs += Date.now() - t0;
      progress({ phase: 'Concluído', percent: 100, evaluated: evaluated });
    }

    /** Novas buscas locais para encontrar mais times diversos. */
    async function expand(onProgress) {
      const t0 = Date.now();
      progress = onProgress || function () {};
      base = evaluated;
      const steps = teamSize - locked.length;
      expected = SEARCH.expandRestarts * 2 * steps * pool.length;
      const before = complete.size;
      for (let i = 0; i < SEARCH.expandRestarts; i++) {
        const src = shown.length && i % 3 !== 2 ? shown[Math.floor(random() * shown.length)].members : null;
        const start = src ? perturb(src, Math.min(steps, 3)) : fillRandom(locked);
        await hillClimb(start, 'Buscando mais times ' + (i + 1) + '/' + SEARCH.expandRestarts);
      }
      elapsedMs += Date.now() - t0;
      progress({ phase: 'Concluído', percent: 100, evaluated: evaluated });
      return complete.size - before;
    }

    /** Um time pode ser mostrado (diversidade em relação aos já mostrados)? */
    function isDiverse(members) {
      const keys = new Set(members.map(function (p) { return p.key; }));
      for (let i = 0; i < shown.length; i++) {
        let shared = 0;
        shown[i].members.forEach(function (p) { if (keys.has(p.key) && !lockedKeys.has(p.key)) shared++; });
        if (shared > SEARCH.maxShared) return false;
      }
      return true;
    }

    /** Monta o objeto de resultado completo (análise, score detalhado, resumo). */
    function materialize(r, rank) {
      const members = r.members.slice().sort(function (a, b) {
        return (lockedKeys.has(b.key) - lockedKeys.has(a.key)) || a.id - b.id;
      });
      const analysis = E.analyzeTeam(members, ctx);
      const sc = E.calculateFinalTeamScore(members, ctx, opts.weights);
      return {
        rank: rank,
        objective: objective,
        objectiveScore: Math.round(r.score),
        focus: focusMetrics(analysis),
        keys: members.map(function (p) { return p.key; }),
        score: sc.total,
        scoreDetail: sc,
        analysis: analysis,
        summary: E.summarizeTeam(analysis, sc, ctx),
        members: r.members,
      };
    }

    /** Métricas de destaque para os objetivos de cobertura e resistência. */
    function focusMetrics(a) {
      const se = a.offense.filter(function (o) { return o.best >= 2; }).length;
      const uncovered = a.defense.filter(function (d) { return d.answers === 0; }).length;
      const stacked = a.defense.filter(function (d) { return d.weak >= 3 || (d.weak >= 2 && d.answers === 0); }).length;
      const immunities = a.defense.filter(function (d) { return d.immune > 0; }).length;
      return {
        superEffectiveTypes: se, comboCoverage: Math.round(a.comboCoverage.superEffective * 100),
        uncoveredTypes: uncovered, stackedWeaknesses: stacked, immunityTypes: immunities,
      };
    }

    /** Próximos `n` times diversos, em ordem de score. */
    function next(n) {
      if (!ranked) ranked = Array.from(complete.values()).sort(function (a, b) { return b.score - a.score; });
      const out = [];
      for (let i = 0; i < ranked.length && out.length < n; i++) {
        const r = ranked[i];
        if (shownKeys.has(r.key) || !isDiverse(r.members)) continue;
        shownKeys.add(r.key);
        shown.push(r);
        out.push(materialize(r, shown.length));
      }
      return out;
    }

    /** Próximos `n` times; expande a busca quantas vezes for preciso (até 4) para completar. */
    async function more(n, onProgress) {
      let out = next(n), tries = 0;
      while (out.length < n && tries++ < 4) {
        await expand(onProgress);
        out = out.concat(next(n - out.length));
      }
      return out;
    }

    return {
      run: run, next: next, more: more, expand: expand,
      stats: function () { return { evaluated: evaluated, poolSize: pool.length, elapsedMs: elapsedMs, bank: complete.size, shown: shown.length }; },
    };
  }

  /** Atalho: busca completa e devolve os `count` melhores times. */
  async function generateTeams(ctx, opts, onProgress) {
    const s = createGenerationSession(ctx, opts);
    await s.run(onProgress);
    const teams = await s.more((opts && opts.count) || 10, onProgress);
    const meta = s.stats();
    teams.forEach(function (t) { t.meta = meta; });
    return teams;
  }

  E.GENERATOR_SEARCH = SEARCH;
  E.GENERATOR_OBJECTIVES = OBJECTIVES;
  E.reducePool = reducePool;
  E.createGenerationSession = createGenerationSession;
  E.generateTeams = generateTeams;
})(PTA);
