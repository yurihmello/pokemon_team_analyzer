/**
 * teamBuilder — montagem do time (6 slots + busca de Pokémon do jogo selecionado).
 */
(function (PTA) {
  'use strict';

  const D = PTA.ui.dom, C = PTA.ui.c, esc = D.esc;
  const EXAMPLE_TEAM = ['feraligatr', 'haunter', 'charizard', 'lucario', 'dragonite', 'tyranitar'];

  function slotsHtml(app) {
    const ctx = app.ctx, team = app.team();
    const size = ctx.rules.teamSize || 6;
    let html = '';
    for (let i = 0; i < size; i++) {
      const p = team[i] ? ctx.get(team[i]) : null;
      if (p) {
        html += '<li class="slot filled" style="--c1:' + C.typeMeta(p.types[0]).color + ';--c2:' + C.typeMeta(p.types[1] || p.types[0]).color + '">' +
          C.sprite(p, 56) +
          '<div class="slot-info"><b>' + esc(p.name) + '</b>' +
          '<span class="types">' + C.typeBadges(p.types, { small: true }) + '</span>' +
          '<span class="slot-role">' + esc(p.roles.label) + (p.isFinal ? '' : ', pode evoluir') + '</span></div>' +
          '<button class="icon-btn" data-action="remove" data-key="' + esc(p.key) + '" aria-label="Remover ' + esc(p.name) + '">✕</button></li>';
      } else {
        html += '<li class="slot empty"><button class="slot-add" data-action="focus-search">Adicionar Pokémon</button></li>';
      }
    }
    return html;
  }

  function resultsHtml(app, query, type) {
    const ctx = app.ctx;
    const members = ctx.resolve(app.team());
    const full = members.length >= (ctx.rules.teamSize || 6);
    if (!query && !type) return '<p class="hint">Digite um nome (ex.: "rotom", "mega", "hisui") ou filtre por tipo.</p>';
    const list = ctx.search(query, { type: type || null, limit: 30 });
    if (!list.length) return '<p class="hint">Nenhum Pokémon encontrado em ' + esc(ctx.game.shortName) + '. Verifique se o conteúdo (DLC) está habilitado em Ajustes.</p>';
    return '<ul class="results">' + list.map(function (p) {
      const ok = !full && ctx.canJoin(members, p);
      const why = full ? 'Time completo' : (members.some(function (m) { return m.speciesId === p.speciesId; }) ? 'Espécie já está no time' : (!ok ? 'Limite de Megas atingido' : ''));
      return '<li><button class="result" data-action="add" data-key="' + esc(p.key) + '"' + (ok ? '' : ' disabled title="' + esc(why) + '"') + '>' +
        C.sprite(p, 40) + '<span class="result-name">' + esc(p.name) + '<span class="tags">' + C.formTags(p, ctx) + '</span></span>' +
        '<span class="types">' + C.typeBadges(p.types, { small: true }) + '</span></button></li>';
    }).join('') + '</ul>';
  }

  /** Renderiza o construtor no container. */
  function render(container, app) {
    const types = PTA.data.types;
    container.innerHTML =
      '<div class="panel party">' +
        '<div class="panel-head"><h2>Seu time <span class="count" id="party-count"></span></h2>' +
          '<div class="head-actions"><button class="btn ghost sm" data-action="example">Exemplo</button>' +
          '<button class="btn ghost sm" data-action="clear">Limpar</button></div></div>' +
        '<ol class="slots" id="slots"></ol>' +
        '<div class="search">' +
          '<label for="mon-search" class="sr-only">Buscar Pokémon</label>' +
          '<div class="search-row"><input id="mon-search" type="search" autocomplete="off" placeholder="Buscar Pokémon em ' + esc(app.ctx.game.shortName) + '…">' +
          '<select id="mon-type" aria-label="Filtrar por tipo"><option value="">Tipo</option>' +
            types.order.map(function (t) { return '<option value="' + t + '">' + esc(types.meta[t].name) + '</option>'; }).join('') +
          '</select></div>' +
          '<div id="search-results"></div>' +
        '</div>' +
      '</div>';

    const input = container.querySelector('#mon-search');
    const typeSel = container.querySelector('#mon-type');
    const results = container.querySelector('#search-results');
    function refreshResults() { results.innerHTML = resultsHtml(app, input.value, typeSel.value); }
    input.addEventListener('input', D.debounce(refreshResults, 80));
    typeSel.addEventListener('change', refreshResults);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        const first = results.querySelector('.result:not([disabled])');
        if (first) first.click();
      }
    });

    D.on(container, 'click', '[data-action]', function (e, el) {
      const a = el.dataset.action;
      if (a === 'add') { app.addToTeam(el.dataset.key); input.select(); }
      else if (a === 'remove') app.removeFromTeam(el.dataset.key);
      else if (a === 'clear') app.setTeam([]);
      else if (a === 'focus-search') input.focus();
      else if (a === 'example') {
        const keys = EXAMPLE_TEAM.filter(function (k) { return app.ctx.get(k); });
        if (keys.length < 4) {
          // Jogo sem esses Pokémon: usa um time de exemplo com os finais mais fortes disponíveis.
          const pool = app.ctx.candidatePool({}).sort(function (a, b) { return b.power - a.power; });
          for (let i = 0; i < pool.length && keys.length < 6; i++) if (app.ctx.canJoin(app.ctx.resolve(keys), pool[i])) keys.push(pool[i].key);
        }
        app.setTeam(keys.slice(0, 6));
      }
    });

    update(container, app);
    refreshResults();
    container._refreshResults = refreshResults;
  }

  /** Atualiza só os slots (mantém o foco na busca). */
  function update(container, app) {
    const slots = container.querySelector('#slots');
    if (!slots) return;
    slots.innerHTML = slotsHtml(app);
    container.querySelector('#party-count').textContent = app.team().length + '/' + (app.ctx.rules.teamSize || 6);
    if (container._refreshResults) container._refreshResults();
  }

  PTA.ui.teamBuilder = { render: render, update: update };
})(PTA);
