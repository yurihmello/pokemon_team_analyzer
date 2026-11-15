/**
 * homeView — tela inicial: escolha do jogo.
 */
(function (PTA) {
  'use strict';

  const esc = PTA.ui.dom.esc;

  const MECHANIC_LABELS = {
    megaEvolution: 'Mega Evolução',
    terastallization: 'Terastalização',
    dynamax: 'Dynamax',
    zMoves: 'Z-Moves',
  };

  /** Jogos ordenados do mais recente para o mais antigo. */
  function sortedGames() {
    return PTA.data.gameOrder.map(function (id) { return PTA.data.games[id]; })
      .filter(function (g) { return PTA.data.availability[g.id]; })
      .sort(function (a, b) { return b.year - a.year; });
  }

  /** Resumo de um jogo (para o painel de detalhes). */
  function gameFacts(game) {
    const av = PTA.data.availability[game.id];
    const db = PTA.data.pokemonDB.byKey;
    let megas = 0, regional = 0;
    av.entries.forEach(function (e) { const p = db[e[0]]; if (p.isMega) megas++; if (p.regional) regional++; });
    const mech = Object.keys(MECHANIC_LABELS).filter(function (k) { return game.mechanics[k]; }).map(function (k) { return MECHANIC_LABELS[k]; });
    return { total: av.entries.length, megas: megas, regional: regional, packs: av.packs, mechanics: mech };
  }

  function detailHtml(game) {
    const f = gameFacts(game);
    return '<div class="game-detail" style="--accent:' + game.theme.accent + ';--accent2:' + game.theme.accent2 + '">' +
      '<div class="game-detail-head"><h2>' + esc(game.name) + '</h2><p>' + esc(game.region) + ', ' + game.year + ' (Geração ' + game.generation + ')</p></div>' +
      '<dl class="facts">' +
        '<div><dt>Pokémon e formas</dt><dd>' + f.total + '</dd></div>' +
        (f.megas ? '<div><dt>Mega Evoluções</dt><dd>' + f.megas + '</dd></div>' : '') +
        (f.regional ? '<div><dt>Formas regionais</dt><dd>' + f.regional + '</dd></div>' : '') +
        '<div><dt>Conteúdos</dt><dd>' + f.packs.length + '</dd></div>' +
      '</dl>' +
      '<ul class="pack-list">' + f.packs.map(function (p) { return '<li>' + esc(p.label) + (p.dlc ? ' <span class="tag pack">DLC</span>' : '') + '</li>'; }).join('') + '</ul>' +
      (f.mechanics.length ? '<p class="mechanics">Mecânicas: ' + f.mechanics.map(esc).join(', ') + '</p>' : '') +
      (game.effectiveness !== 'standard' ? '<p class="note">Regra especial de dano: ' + esc((game.notes || [])[0] || game.effectiveness) + '</p>' : '') +
      '</div>';
  }

  /** Renderiza a tela inicial. */
  function render(root, app) {
    const games = sortedGames();
    const selected = app.state.homeSelection || app.state.gameId || games[0].id;
    root.innerHTML =
      '<section class="home">' +
        '<div class="home-intro">' +
          '<h1 class="home-title">Pokémon<br>Team Analyzer</h1>' +
          '<p class="lead">Analise fraquezas, resistências e cobertura do seu time, receba sugestões de troca e gere composições equilibradas — sempre com os Pokémon que existem no jogo que você está jogando.</p>' +
          '<label class="game-select-label" for="game-select">Escolha um jogo para começar</label>' +
          '<div class="game-select-row">' +
            '<select id="game-select" class="game-select">' + games.map(function (g) {
              return '<option value="' + g.id + '"' + (g.id === selected ? ' selected' : '') + '>' + esc(g.name) + '</option>';
            }).join('') + '</select>' +
            '<button class="btn primary lg" data-action="start">Começar</button>' +
          '</div>' +
          '<div id="game-detail">' + detailHtml(PTA.data.games[selected]) + '</div>' +
        '</div>' +
        '<div class="game-grid" role="list">' + games.map(function (g) {
          const f = gameFacts(g);
          return '<button class="game-tile' + (g.id === selected ? ' active' : '') + '" role="listitem" data-game="' + g.id + '" style="--accent:' + g.theme.accent + ';--accent2:' + g.theme.accent2 + '">' +
            '<span class="game-tile-name">' + esc(g.shortName) + '</span>' +
            '<span class="game-tile-meta">' + esc(g.region) + ', ' + g.year + '</span>' +
            '<span class="game-tile-count">' + f.total + ' Pokémon</span></button>';
        }).join('') + '</div>' +
      '</section>';

    const select = root.querySelector('#game-select');
    function choose(id) {
      app.state.homeSelection = id;
      select.value = id;
      root.querySelector('#game-detail').innerHTML = detailHtml(PTA.data.games[id]);
      root.querySelectorAll('.game-tile').forEach(function (t) { t.classList.toggle('active', t.dataset.game === id); });
    }
    select.addEventListener('change', function () { choose(select.value); });
    root.querySelectorAll('.game-tile').forEach(function (t) {
      t.addEventListener('click', function () { choose(t.dataset.game); });
      t.addEventListener('dblclick', function () { app.openGame(t.dataset.game); });
    });
    root.querySelector('[data-action="start"]').addEventListener('click', function () { app.openGame(select.value); });
  }

  PTA.ui.homeView = { render: render, sortedGames: sortedGames };
})(PTA);
