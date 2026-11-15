/**
 * typeCalculator — efetividade de tipos, sensível às regras de cada jogo.
 *
 * Cada jogo informa:
 *   - typeChart:     qual tabela usar (ex.: 'gen6')
 *   - effectiveness: como combinar os fatores de dois tipos (ex.: 'standard', 'legends-arceus')
 *
 * Exemplo:
 *   const calc = PTA.engine.createTypeCalculator(game);
 *   calc.multiplier('ground', ['fire', 'flying'])   // → 0
 *   calc.defensiveProfile(['steel', 'fairy'])       // → Float32Array(18) com o dano recebido de cada tipo
 */
(function (PTA) {
  'use strict';

  // === MODELOS DE EFETIVIDADE ===
  // Recebem os fatores individuais (um por tipo defensor) e devolvem o multiplicador final.
  const EFFECTIVENESS_MODELS = {
    /** Padrão da série principal: produto dos fatores (4×, 0,25×...). */
    standard: function (factors) {
      let m = 1;
      for (let i = 0; i < factors.length; i++) m *= factors[i];
      return m;
    },
    /** Legends: Arceus — duplo super efetivo = 2,5×; duplo pouco efetivo = 0,4×. */
    'legends-arceus': function (factors) {
      if (factors.indexOf(0) !== -1) return 0;
      if (factors.length === 2) {
        if (factors[0] > 1 && factors[1] > 1) return 2.5;
        if (factors[0] < 1 && factors[1] < 1) return 0.4;
      }
      return EFFECTIVENESS_MODELS.standard(factors);
    },
  };

  /** Classifica um multiplicador. Ex.: classify(2) → 'weak' */
  function classify(mult) {
    if (mult === 0) return 'immune';
    if (mult > 1) return 'weak';
    if (mult < 1) return 'resist';
    return 'neutral';
  }

  /** Formata um multiplicador para exibição. Ex.: formatMultiplier(0.25) → '¼×' */
  function formatMultiplier(mult) {
    const map = { 0: '0×', 0.25: '¼×', 0.4: '0,4×', 0.5: '½×', 1: '1×', 2: '2×', 2.5: '2,5×', 4: '4×' };
    return map[mult] !== undefined ? map[mult] : String(mult).replace('.', ',') + '×';
  }

  /**
   * Cria a calculadora de tipos de um jogo.
   * Ex.: PTA.engine.createTypeCalculator(PTA.data.games['legends-arceus'])
   */
  function createTypeCalculator(game) {
    const chart = PTA.data.typeCharts[game.typeChart || 'gen6'];
    if (!chart) throw new Error('Tabela de tipos não encontrada: ' + game.typeChart);
    const model = EFFECTIVENESS_MODELS[game.effectiveness || 'standard'];
    if (!model) throw new Error('Modelo de efetividade desconhecido: ' + game.effectiveness);

    const types = PTA.data.types.order;
    const index = {};
    types.forEach(function (t, i) { index[t] = i; });
    const profileCache = new Map();

    /** Fator de um tipo de ataque contra UM tipo defensor. */
    function single(atk, def) {
      const row = chart.attack[atk];
      return row && row[def] !== undefined ? row[def] : 1;
    }

    /** Multiplicador final de um ataque contra um Pokémon com 1 ou 2 tipos. */
    function multiplier(atk, defTypes) {
      const factors = new Array(defTypes.length);
      for (let i = 0; i < defTypes.length; i++) factors[i] = single(atk, defTypes[i]);
      return model(factors);
    }

    /** Chave canônica de uma combinação. Ex.: comboKey(['flying','fire']) → 'fire/flying' */
    function comboKey(defTypes) {
      return defTypes.slice().sort().join('/');
    }

    /** Dano recebido de cada um dos 18 tipos (cacheado por combinação). */
    function defensiveProfile(defTypes) {
      const key = comboKey(defTypes);
      let prof = profileCache.get(key);
      if (!prof) {
        prof = new Float32Array(types.length);
        for (let i = 0; i < types.length; i++) prof[i] = multiplier(types[i], defTypes);
        profileCache.set(key, prof);
      }
      return prof;
    }

    /** Melhor multiplicador entre vários tipos de ataque (ex.: STABs) contra um defensor. */
    function bestMultiplier(atkTypes, defTypes) {
      let best = 0;
      for (let i = 0; i < atkTypes.length; i++) {
        const m = multiplier(atkTypes[i], defTypes);
        if (m > best) best = m;
      }
      return best;
    }

    return {
      types: types,
      index: index,
      effectiveness: game.effectiveness || 'standard',
      /** Limiar de "fraqueza dupla" (4× no padrão, 2,5× em Legends: Arceus). */
      doubleWeakThreshold: (game.effectiveness === 'legends-arceus') ? 2.5 : 4,
      single: single,
      multiplier: multiplier,
      comboKey: comboKey,
      defensiveProfile: defensiveProfile,
      bestMultiplier: bestMultiplier,
    };
  }

  PTA.engine.EFFECTIVENESS_MODELS = EFFECTIVENESS_MODELS;
  PTA.engine.classifyMultiplier = classify;
  PTA.engine.formatMultiplier = formatMultiplier;
  PTA.engine.createTypeCalculator = createTypeCalculator;
})(PTA);
