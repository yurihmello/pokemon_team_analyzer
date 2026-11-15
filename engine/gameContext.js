/**
 * gameContext — tudo que o motor precisa saber sobre UM jogo.
 *
 * Junta a config do jogo + disponibilidade gerada + banco de Pokémon e
 * pré-calcula estruturas usadas milhares de vezes pelo scorer/gerador:
 *   - perfil defensivo de cada Pokémon (dano recebido dos 18 tipos)
 *   - combinações de tipos que realmente existem no jogo (e sua frequência)
 *   - matriz ataque × combinação
 *   - peso de cada tipo (tipos mais comuns no jogo pesam mais)
 *   - lista de "ameaças comuns" (Pokémon mais fortes do jogo)
 *
 * Ex.: const ctx = PTA.engine.createGameContext('scarlet-violet', { packs: ['paldea', 'kitakami'] });
 *      ctx.get('garchomp').profile  // Float32Array(18)
 */
(function (PTA) {
  'use strict';

  const THREAT_COUNT = 40;

  /**
   * Papéis derivados dos stats base. Heurística simples da V1 (ver README).
   * stats = [hp, atk, def, spa, spd, spe]
   */
  function deriveRoles(stats) {
    const hp = stats[0], atk = stats[1], def = stats[2], spa = stats[3], spd = stats[4], spe = stats[5];
    const physical = atk >= 95 && atk >= spa + 10;
    const special = spa >= 95 && spa >= atk + 10;
    const mixed = atk >= 95 && spa >= 95 && !physical && !special;
    const fast = spe >= 95;
    const physBulk = hp + def >= 185;
    const specBulk = hp + spd >= 185;
    let label;
    if (physBulk && specBulk && !physical && !special && !mixed) label = 'Tanque';
    else if (mixed) label = 'Atacante misto';
    else if (physical) label = fast ? 'Atacante físico rápido' : 'Atacante físico';
    else if (special) label = fast ? 'Atacante especial rápido' : 'Atacante especial';
    else if (physBulk) label = 'Defensor físico';
    else if (specBulk) label = 'Defensor especial';
    else label = fast ? 'Suporte rápido' : 'Suporte';
    return { physical: physical, special: special, mixed: mixed, fast: fast, physBulk: physBulk, specBulk: specBulk, label: label };
  }

  /** Percentil simples de uma lista numérica. */
  function percentile(values, p) {
    if (!values.length) return 0;
    const s = values.slice().sort(function (a, b) { return a - b; });
    return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))];
  }

  /**
   * Cria o contexto de análise de um jogo.
   * options.packs: ids dos packs habilitados (padrão: todos).
   */
  function createGameContext(gameId, options) {
    options = options || {};
    const game = PTA.data.games[gameId];
    const availability = PTA.data.availability[gameId];
    const db = PTA.data.pokemonDB;
    if (!game) throw new Error('Jogo não registrado: ' + gameId);
    if (!availability) throw new Error('Disponibilidade não gerada para: ' + gameId + ' (rode tools/build-data.mjs)');

    const calc = PTA.engine.createTypeCalculator(game);
    // Regras efetivas = regras do jogo + sobrescritas do usuário (ex.: { maxMegasPerTeam: 6 } = Megas sem limite).
    const rules = Object.assign({ teamSize: 6, speciesClause: true, maxMegasPerTeam: 0 }, game.rules, options.rules || {});
    if (!game.mechanics.megaEvolution) rules.maxMegasPerTeam = 0;
    const T = calc.types.length;
    const enabledPacks = new Set(options.packs && options.packs.length ? options.packs : availability.packs.map(function (p) { return p.id; }));
    // O primeiro pack (jogo base) é sempre habilitado.
    enabledPacks.add(availability.packs[0].id);

    const adjust = (PTA.data.adjustments && PTA.data.adjustments.powerFactor) || {};

    // === POKÉMON DISPONÍVEIS ===
    const all = [];
    const byKey = {};
    availability.entries.forEach(function (entry) {
      const key = entry[0], pack = entry[1];
      if (!enabledPacks.has(pack)) return;
      const base = db.byKey[key];
      if (!base) return;
      const p = Object.assign({}, base, {
        pack: pack,
        comboKey: calc.comboKey(base.types),
        typeIdx: base.types.map(function (t) { return calc.index[t]; }),
        profile: calc.defensiveProfile(base.types),
        roles: deriveRoles(base.stats),
        dexNo: availability.regionalDex[base.speciesId] || null,
        search: (base.name + ' ' + base.key + ' ' + (base.formName || '')).toLowerCase(),
      });
      all.push(p);
      byKey[key] = p;
    });

    // Evoluções dentro DESTE jogo: uma espécie é final se nenhuma evolução dela está disponível.
    const evolvesInGame = new Set();
    all.forEach(function (p) { if (p.evolvesFrom) evolvesInGame.add(p.evolvesFrom); });
    all.forEach(function (p) { p.isFinal = !evolvesInGame.has(p.speciesId); });

    // === PODER: Base Stat Rating (BSR, Smogon/X-Act) relativo ao metagame deste jogo ===
    // Metagame = todos os Pokémon finais disponíveis (inclui Megas). Ajustes manuais em data/adjustments.js.
    const bsrCalc = PTA.engine.createBsrCalculator(all.filter(function (p) { return p.isFinal; }).map(function (p) { return p.stats; }));
    all.forEach(function (p) {
      p.rating = bsrCalc.rate(p.stats);
      p.bsr = p.rating.bsr;
      const factor = adjust[p.key] || adjust[p.species] || 1;
      p.power = Math.round(p.bsr - (1 - factor) * 450);
    });

    const finals = all.filter(function (p) { return p.isFinal && !p.isMega; });

    // === COMBINAÇÕES DE TIPOS DO JOGO ===
    const comboMap = new Map();
    finals.forEach(function (p) {
      let c = comboMap.get(p.comboKey);
      if (!c) { c = { key: p.comboKey, types: p.types.slice().sort(), count: 0, index: comboMap.size }; comboMap.set(p.comboKey, c); }
      c.count++;
    });
    all.forEach(function (p) {
      // Megas/pré-evoluções com combinações inéditas também recebem índice (peso 0).
      if (!comboMap.has(p.comboKey)) comboMap.set(p.comboKey, { key: p.comboKey, types: p.types.slice().sort(), count: 0, index: comboMap.size });
      p.comboIdx = comboMap.get(p.comboKey).index;
    });
    const combos = Array.from(comboMap.values());
    const C = combos.length;
    const comboWeight = new Float32Array(C);
    combos.forEach(function (c) { comboWeight[c.index] = c.count; });

    // attackVsCombo[t * C + c] = multiplicador do tipo t contra a combinação c
    const attackVsCombo = new Float32Array(T * C);
    for (let t = 0; t < T; t++) {
      for (let c = 0; c < C; c++) attackVsCombo[t * C + c] = calc.multiplier(calc.types[t], combos[c].types);
    }

    // === PESO DOS TIPOS ===
    // 50% uniforme + 50% proporcional à frequência do tipo entre os Pokémon finais do jogo.
    const freq = new Float64Array(T);
    finals.forEach(function (p) { p.typeIdx.forEach(function (i) { freq[i] += 1; }); });
    const freqSum = freq.reduce(function (a, b) { return a + b; }, 0) || 1;
    const typeWeight = new Float64Array(T);
    for (let t = 0; t < T; t++) typeWeight[t] = (0.5 / T + 0.5 * freq[t] / freqSum) * T; // média = 1
    let typeWeightSum = 0;
    for (let t = 0; t < T; t++) typeWeightSum += typeWeight[t];

    // === REFERÊNCIA DE PODER (BSR) DO JOGO ===
    const bsts = finals.map(function (p) { return p.power; });
    const bstRef = { low: percentile(bsts, 0.35), high: percentile(bsts, 0.92) };

    // === AMEAÇAS COMUNS ===
    // Os Pokémon finais (não lendários) mais fortes do jogo, ponderados pelo BST.
    const threatPool = finals.filter(function (p) { return !p.legendary && !p.mythical; });
    const threats = threatPool.slice().sort(function (a, b) { return b.power - a.power || a.id - b.id; })
      .slice(0, THREAT_COUNT)
      .map(function (p) {
        const w = Math.min(1, Math.max(0.3, (p.power - bstRef.low) / Math.max(1, bstRef.high - bstRef.low)));
        return { pokemon: p, weight: w };
      });

    /** Pokémon por chave. Ex.: ctx.get('garchomp') */
    function get(key) { return byKey[key] || null; }

    /** Busca por nome/forma, com filtro opcional de tipo. Ex.: ctx.search('rotom') */
    function search(query, opts) {
      opts = opts || {};
      const q = (query || '').trim().toLowerCase();
      let list = all;
      if (opts.type) list = list.filter(function (p) { return p.types.indexOf(opts.type) !== -1; });
      if (opts.finalsOnly) list = list.filter(function (p) { return p.isFinal; });
      if (q) {
        list = list.filter(function (p) { return p.search.indexOf(q) !== -1; })
          .sort(function (a, b) {
            const as = a.name.toLowerCase().indexOf(q) === 0 ? 0 : 1;
            const bs = b.name.toLowerCase().indexOf(q) === 0 ? 0 : 1;
            return as - bs || a.id - b.id;
          });
      }
      return opts.limit ? list.slice(0, opts.limit) : list;
    }

    /**
     * Pool de candidatos para geração/recomendação.
     * opts: { finalsOnly=true, includeLegendary=false, includeMega=true, minPower=0, exclude:Set }
     */
    function candidatePool(opts) {
      opts = opts || {};
      const finalsOnly = opts.finalsOnly !== false;
      const allowMega = opts.includeMega !== false && game.mechanics.megaEvolution && (rules.maxMegasPerTeam || 0) > 0;
      return all.filter(function (p) {
        if (finalsOnly && !p.isFinal) return false;
        if (!opts.includeLegendary && (p.legendary || p.mythical)) return false;
        if (p.isMega && !allowMega) return false;
        if (opts.minPower && p.power < opts.minPower) return false;
        if (opts.exclude && opts.exclude.has(p.key)) return false;
        return true;
      });
    }

    /** Verifica se um time respeita as regras do jogo. Ex.: ctx.validateTeam(['garchomp','garchomp-mega']) */
    function validateTeam(members) {
      const errors = [];
      if (members.length > (rules.teamSize || 6)) errors.push('O time tem mais de ' + (rules.teamSize || 6) + ' Pokémon.');
      const megas = members.filter(function (p) { return p.isMega; }).length;
      const maxMegas = rules.maxMegasPerTeam || 0;
      if (megas > maxMegas) errors.push(maxMegas === 0 ? 'Este jogo não possui Mega Evolução.' : 'A regra atual permite no máximo ' + maxMegas + ' Mega por time (ative "Megas sem limite" para liberar).');
      if (rules.speciesClause) {
        const seen = {};
        members.forEach(function (p) {
          if (seen[p.speciesId]) errors.push('Espécie repetida: ' + p.name + ' (Species Clause).');
          seen[p.speciesId] = true;
        });
      }
      return errors;
    }

    /** Um candidato pode entrar no time (substituindo `replaceKey`, se houver)? */
    function canJoin(members, candidate, replaceKey) {
      const rest = members.filter(function (p) { return p.key !== replaceKey; });
      if (rest.some(function (p) { return p.key === candidate.key; })) return false;
      if (rules.speciesClause && rest.some(function (p) { return p.speciesId === candidate.speciesId; })) return false;
      if (candidate.isMega) {
        const megas = rest.filter(function (p) { return p.isMega; }).length;
        if (megas + 1 > (rules.maxMegasPerTeam || 0)) return false;
      }
      return true;
    }

    return {
      game: game,
      gameId: gameId,
      rules: rules,
      megaUnlimited: rules.maxMegasPerTeam >= rules.teamSize,
      availability: availability,
      packs: availability.packs.map(function (p) { return Object.assign({ enabled: enabledPacks.has(p.id) }, p); }),
      enabledPacks: Array.from(enabledPacks),
      calc: calc,
      types: calc.types,
      all: all,
      finals: finals,
      combos: combos,
      comboWeight: comboWeight,
      attackVsCombo: attackVsCombo,
      typeWeight: typeWeight,
      typeWeightSum: typeWeightSum,
      bstRef: bstRef,
      threats: threats,
      get: get,
      search: search,
      candidatePool: candidatePool,
      validateTeam: validateTeam,
      canJoin: canJoin,
      resolve: function (keys) { return keys.map(get).filter(Boolean); },
    };
  }

  PTA.engine.deriveRoles = deriveRoles;
  PTA.engine.createGameContext = createGameContext;
})(PTA);
