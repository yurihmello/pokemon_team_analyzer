/**
 * pokedexView — banco de Pokémon disponíveis no jogo selecionado.
 */
(function (PTA) {
  'use strict';

  const D = PTA.ui.dom, C = PTA.ui.c, esc = D.esc;
  const PAGE = 60;

  const SORTS = {
    dex: function (a, b) { return (a.dexNo || 9999) - (b.dexNo || 9999) || a.id - b.id; },
    national: function (a, b) { return a.id - b.id; },
    name: function (a, b) { return a.name.localeCompare(b.name); },
    bst: function (a, b) { return b.bst - a.bst || a.id - b.id; },
    bsr: function (a, b) { return b.bsr - a.bsr || a.id - b.id; },
    speed: function (a, b) { return b.stats[5] - a.stats[5] || a.id - b.id; },
  };

  function filtered(app) {
    const f = app.state.dexFilters, ctx = app.ctx;
    let list = ctx.search(f.query, { type: f.type || null });
    if (f.type2) list = list.filter(function (p) { return p.types.indexOf(f.type2) !== -1; });
    if (f.finals) list = list.filter(function (p) { return p.isFinal; });
    if (f.form === 'mega') list = list.filter(function (p) { return p.isMega; });
    if (f.form === 'regional') list = list.filter(function (p) { return p.regional; });
    if (f.form === 'legend') list = list.filter(function (p) { return p.legendary || p.mythical; });
    if (f.pack) list = list.filter(function (p) { return p.pack === f.pack; });
    return list.slice().sort(SORTS[f.sort] || SORTS.dex);
  }

  function gridHtml(app, limit) {
    const ctx = app.ctx;
    const members = ctx.resolve(app.team());
    const full = members.length >= (ctx.rules.teamSize || 6);
    const list = filtered(app);
    const shown = list.slice(0, limit);
    return '<p class="dex-count">' + list.length + ' Pokémon encontrados</p>' +
      (list.length ? '<div class="dex-grid">' + shown.map(function (p) {
        const inTeam = members.some(function (m) { return m.key === p.key; });
        return C.pokemonCard(p, ctx, { action: 'add', actionLabel: inTeam ? 'No time' : 'Adicionar', disabled: inTeam || full || !ctx.canJoin(members, p) });
      }).join('') + '</div>' : '<p class="hint big">Nenhum Pokémon com esses filtros neste jogo.</p>') +
      (list.length > limit ? '<div class="more-wrap"><button class="btn" data-action="more">Mostrar mais (' + (list.length - limit) + ')</button></div>' : '');
  }

  function render(container, app) {
    const f = app.state.dexFilters, ctx = app.ctx, types = PTA.data.types;
    const typeOpts = function (sel) {
      return types.order.map(function (t) { return '<option value="' + t + '"' + (sel === t ? ' selected' : '') + '>' + esc(types.meta[t].name) + '</option>'; }).join('');
    };
    const packs = ctx.packs.filter(function (p) { return p.enabled; });
    container.innerHTML =
      '<section class="panel dex">' +
        '<div class="panel-head"><h2>Pokédex de ' + esc(ctx.game.shortName) + '</h2></div>' +
        '<p class="panel-sub">Somente Pokémon e formas que existem neste jogo, considerando os conteúdos habilitados em Ajustes.</p>' +
        '<div class="dex-filters">' +
          '<input type="search" data-f="query" placeholder="Nome ou forma" value="' + esc(f.query) + '" aria-label="Buscar">' +
          '<select data-f="type" aria-label="Tipo 1"><option value="">Qualquer tipo</option>' + typeOpts(f.type) + '</select>' +
          '<select data-f="type2" aria-label="Tipo 2"><option value="">+ outro tipo</option>' + typeOpts(f.type2) + '</select>' +
          '<select data-f="form" aria-label="Formas"><option value="">Todas as formas</option>' +
            [['mega', 'Megas'], ['regional', 'Regionais'], ['legend', 'Lendários e míticos']].map(function (o) { return '<option value="' + o[0] + '"' + (f.form === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
          (packs.length > 1 ? '<select data-f="pack" aria-label="Conteúdo"><option value="">Todo o conteúdo</option>' + packs.map(function (p) { return '<option value="' + p.id + '"' + (f.pack === p.id ? ' selected' : '') + '>' + esc(p.label) + '</option>'; }).join('') + '</select>' : '') +
          '<select data-f="sort" aria-label="Ordenar"><option value="dex">Nº regional</option><option value="national">Nº nacional</option><option value="name">Nome</option><option value="bsr">Maior BSR (poder)</option><option value="bst">Maior BST</option><option value="speed">Mais rápido</option></select>' +
          '<label class="check"><input type="checkbox" data-f="finals"' + (f.finals ? ' checked' : '') + '> Só totalmente evoluídos</label>' +
        '</div>' +
        '<div id="dex-grid"></div>' +
      '</section>';
    container.querySelector('[data-f="sort"]').value = f.sort || 'dex';

    let limit = PAGE;
    const grid = container.querySelector('#dex-grid');
    function refresh() { grid.innerHTML = gridHtml(app, limit); }
    const debounced = D.debounce(function () { limit = PAGE; refresh(); app.save(); }, 120);
    D.on(container, 'input', '[data-f]', function (e, el) {
      f[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
      debounced();
    });
    D.on(container, 'click', '[data-action]', function (e, el) {
      if (el.dataset.action === 'more') { limit += PAGE; refresh(); }
      if (el.dataset.action === 'add') { app.addToTeam(el.dataset.key); refresh(); }
    });
    refresh();
  }

  PTA.ui.pokedexView = { render: render };
})(PTA);
