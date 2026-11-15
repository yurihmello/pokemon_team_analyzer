/**
 * PTA — Pokémon Team Analyzer
 * Namespace global + registries.
 *
 * Todos os outros arquivos (dados, motor, interface) se registram aqui.
 * Usamos scripts clássicos (não ES modules) para que o projeto funcione
 * abrindo o index.html diretamente via file://, sem servidor.
 *
 * Ordem de carga: core → data → engine → ui → app.js
 */
(function (global) {
  'use strict';

  const PTA = global.PTA || {};
  PTA.version = '1.0.0';

  // === REGISTRIES DE DADOS ===
  PTA.data = PTA.data || {
    types: null,          // metadados dos 18 tipos (data/types.js)
    typeCharts: {},       // tabelas de efetividade por id (data/generated/type-charts.js)
    pokemonDB: null,      // banco normalizado (data/generated/pokemon-db.js)
    games: {},            // configs de jogo (data/games/*.js)
    gameOrder: [],        // ordem de exibição dos jogos
    availability: {},     // disponibilidade gerada por jogo (data/generated/availability/*.js)
    sprites: null,        // manifesto de sprites locais (data/generated/sprites.js)
  };

  PTA.engine = PTA.engine || {};
  PTA.ui = PTA.ui || {};

  /** Registra os metadados dos tipos. */
  PTA.registerTypes = function (types) {
    PTA.data.types = types;
  };

  /** Registra uma tabela de tipos. Ex.: PTA.registerTypeChart('gen6', {...}) */
  PTA.registerTypeChart = function (id, chart) {
    PTA.data.typeCharts[id] = chart;
  };

  /** Registra o banco de Pokémon gerado pelo tools/build-data.mjs. */
  PTA.registerPokemonDB = function (db) {
    PTA.data.pokemonDB = db;
    db.byKey = {};
    db.pokemon.forEach(function (p) { db.byKey[p.key] = p; });
  };

  /** Registra a configuração (escrita à mão) de um jogo. */
  PTA.registerGame = function (config) {
    if (!config || !config.id) throw new Error('registerGame: config sem id');
    if (!PTA.data.games[config.id]) PTA.data.gameOrder.push(config.id);
    PTA.data.games[config.id] = config;
  };

  /** Registra a disponibilidade (gerada) de Pokémon de um jogo. */
  PTA.registerAvailability = function (gameId, availability) {
    PTA.data.availability[gameId] = availability;
  };

  /** Registra o manifesto de sprites baixados localmente. */
  PTA.registerSprites = function (manifest) {
    PTA.data.sprites = manifest;
    manifest.localSet = new Set(manifest.local || []);
  };

  global.PTA = PTA;
})(typeof window !== 'undefined' ? window : globalThis);
