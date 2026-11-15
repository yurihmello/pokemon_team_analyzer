/**
 * app.js — estado da aplicação, rotas e orquestração das views.
 *
 * Rotas (hash):
 *   #/                       → escolha do jogo
 *   #/<jogo>/<aba>           → abas: analisar | gerar | pokedex | ajustes
 */
(function (PTA) {
  'use strict';

  const D = PTA.ui.dom, UI = PTA.ui, E = PTA.engine;
  const STORAGE_KEY = 'pta:v1';
  const TABS = [
    { id: 'analisar', label: 'Analisar time' },
    { id: 'gerar', label: 'Gerar times' },
    { id: 'pokedex', label: 'Pokédex' },
    { id: 'ajustes', label: 'Ajustes' },
  ];

  // === ESTADO ===
  const saved = D.storage.get(STORAGE_KEY, {});
  const state = {
    gameId: saved.gameId || null,
    tab: 'analisar',
    teams: saved.teams || {},          // { gameId: [keys] }
    packs: saved.packs || {},          // { gameId: [packIds] }
    weights: saved.weights || null,    // null = padrão de scoringConfig
    megaUnlimited: !!saved.megaUnlimited, // true = ignora o limite de Megas por time do jogo
    recOptions: saved.recOptions || { includeLegendary: false, includeMega: true },
    genOptions: saved.genOptions || { includeLegendary: false, includeMega: true, skipWeak: true, useLocked: false, seed: 1 },
    dexFilters: saved.dexFilters || { query: '', type: '', type2: '', form: '', pack: '', sort: 'dex', finals: false },
    genResults: null,
    homeSelection: null,
  };

  const app = {
    state: state,
    ctx: null,

    /** Persiste as preferências no navegador. */
    save: function () {
      D.storage.set(STORAGE_KEY, {
        gameId: state.gameId, teams: state.teams, packs: state.packs, weights: state.weights, megaUnlimited: state.megaUnlimited,
        recOptions: state.recOptions, genOptions: state.genOptions, dexFilters: state.dexFilters,
      });
    },

    /** Chaves do time atual (somente Pokémon disponíveis no contexto). */
    team: function () {
      const keys = state.teams[state.gameId] || [];
      return app.ctx ? keys.filter(function (k) { return app.ctx.get(k); }) : keys;
    },

    openGame: function (gameId) { location.hash = '#/' + gameId + '/analisar'; },
    go: function (tab) { location.hash = '#/' + state.gameId + '/' + tab; },

    setTeam: function (keys) {
      const members = app.ctx.resolve(keys);
      const errors = app.ctx.validateTeam(members);
      if (errors.length) { D.toast(errors[0], 'error'); return; }
      state.teams[state.gameId] = members.map(function (p) { return p.key; });
      state.genResults = state.genResults && state.genResults.gameId === state.gameId ? state.genResults : null;
      app.save();
      app.onTeamChange();
    },
    addToTeam: function (key) {
      const members = app.ctx.resolve(app.team());
      const p = app.ctx.get(key);
      if (!p) return;
      if (members.length >= (app.ctx.rules.teamSize || 6)) { D.toast('O time já tem 6 Pokémon. Remova um para adicionar ' + p.name + '.', 'error'); return; }
      if (!app.ctx.canJoin(members, p)) { D.toast(p.name + ' não pode entrar: espécie repetida ou limite de Megas.', 'error'); return; }
      app.setTeam(app.team().concat([key]));
    },
    removeFromTeam: function (key) { app.setTeam(app.team().filter(function (k) { return k !== key; })); },

    setPacks: function (packIds) {
      state.packs[state.gameId] = packIds;
      app.save();
      app.ctx = createContext(state.gameId);
      state.genResults = null;
      renderShell();
    },
    /** Liga/desliga "Megas sem limite" (vale para análise, sugestões e gerador). */
    setMegaUnlimited: function (on) {
      state.megaUnlimited = !!on;
      app.save();
      app.ctx = createContext(state.gameId);
      state.genResults = null;
      renderShell();
      D.toast(on ? 'Megas sem limite ativado' : 'Limite de Megas do jogo restaurado', 'ok');
    },
    setWeights: function (w) {
      state.weights = w;
      app.save();
    },

    /** Reação a mudanças no time: atualiza só o necessário. */
    onTeamChange: function () {
      if (state.tab !== 'analisar') return;
      const builder = D.$('#builder');
      if (builder) UI.teamBuilder.update(builder, app);
      renderAnalysisPanels();
    },
  };

  /** Contexto do jogo com os conteúdos e regras escolhidos pelo usuário. */
  function createContext(gameId) {
    return E.createGameContext(gameId, {
      packs: state.packs[gameId],
      rules: state.megaUnlimited ? { maxMegasPerTeam: 6 } : {},
    });
  }

  // === RENDERIZAÇÃO ===

  function applyTheme(game) {
    const root = document.documentElement;
    if (game) {
      root.style.setProperty('--accent', game.theme.accent);
      root.style.setProperty('--accent2', game.theme.accent2);
    } else {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent2');
    }
  }

  function renderShellHeader() {
    const gameBox = D.$('#shell-game'), tabs = D.$('#tabs');
    if (!state.gameId || !app.ctx) { gameBox.innerHTML = ''; tabs.innerHTML = ''; return; }
    const games = UI.homeView.sortedGames();
    gameBox.innerHTML = '<label class="sr-only" for="shell-select">Jogo</label><select id="shell-select">' + games.map(function (g) {
      return '<option value="' + g.id + '"' + (g.id === state.gameId ? ' selected' : '') + '>' + D.esc(g.shortName) + '</option>';
    }).join('') + '</select>';
    D.$('#shell-select').addEventListener('change', function (e) { location.hash = '#/' + e.target.value + '/' + state.tab; });
    tabs.innerHTML = TABS.map(function (t) {
      return '<a href="#/' + state.gameId + '/' + t.id + '"' + (t.id === state.tab ? ' aria-current="page"' : '') + '>' + t.label + '</a>';
    }).join('');
  }

  function renderAnalysisPanels() {
    const analysisEl = D.$('#analysis'), recEl = D.$('#recs');
    if (!analysisEl) return;
    const members = app.ctx.resolve(app.team());
    analysisEl.innerHTML = members.length
      ? UI.analysisView.renderAnalysis(members, app.ctx, { weights: state.weights, beforeMembers: '<div id="quick"></div>' })
      : '<div id="quick"></div>' + UI.analysisView.renderAnalysis(members, app.ctx);
    UI.quickView.render(D.$('#quick'), app);
    UI.recommendationView.render(recEl, app);
  }

  function renderShell() {
    const main = D.$('#app');
    renderShellHeader();
    document.body.classList.toggle('at-home', !state.gameId);
    if (!state.gameId) {
      applyTheme(null);
      UI.homeView.render(main, app);
      return;
    }
    applyTheme(app.ctx.game);
    const view = document.createElement('div');
    view.className = 'view view-' + state.tab;
    main.innerHTML = '';
    main.appendChild(view);
    if (state.tab === 'analisar') {
      view.innerHTML = '<div class="workspace"><aside id="builder" class="builder"></aside><div class="results-col"><div id="analysis"></div><div id="recs"></div></div></div>';
      UI.teamBuilder.render(D.$('#builder'), app);
      renderAnalysisPanels();
    } else if (state.tab === 'gerar') UI.generatorView.render(view, app);
    else if (state.tab === 'pokedex') UI.pokedexView.render(view, app);
    else if (state.tab === 'ajustes') UI.settingsView.render(view, app);
  }

  /** Interpreta o hash e atualiza o estado. */
  function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    const gameId = parts[0];
    if (!gameId || !PTA.data.games[gameId] || !PTA.data.availability[gameId]) {
      state.gameId = null;
      app.ctx = null;
      renderShell();
      return;
    }
    const tab = TABS.some(function (t) { return t.id === parts[1]; }) ? parts[1] : 'analisar';
    if (state.gameId !== gameId || !app.ctx) {
      state.gameId = gameId;
      app.ctx = createContext(gameId);
      state.genResults = null;
      app.save();
    }
    state.tab = tab;
    renderShell();
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', route);
  document.addEventListener('DOMContentLoaded', function () {
    if (!PTA.data.pokemonDB) {
      D.$('#app').innerHTML = '<section class="panel empty-state"><h2>Dados não encontrados</h2><p>Rode <code>node tools/build-data.mjs</code> para gerar os dados locais.</p></section>';
      return;
    }
    route();
  });

  PTA.app = app;
})(PTA);
