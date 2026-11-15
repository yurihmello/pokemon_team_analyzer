/**
 * recommendationView — sugestões de adição/substituição e comparação antes × depois.
 */
(function (PTA) {
  'use strict';

  const D = PTA.ui.dom, C = PTA.ui.c, E = PTA.engine, esc = D.esc;

  function fmt(n) { return String(Math.round(n)); }

  function reasonsHtml(r) {
    return '<ul class="reasons">' +
      r.pros.map(function (x) { return '<li class="pro">' + esc(x) + '</li>'; }).join('') +
      r.cons.map(function (x) { return '<li class="con">' + esc(x) + '</li>'; }).join('') + '</ul>';
  }

  /** Card de destaque (melhor troca / melhor adição). */
  function heroCard(item, title, idx) {
    const swap = item.type === 'replace';
    return '<article class="hero-rec">' +
      '<h3>' + esc(title) + '</h3>' +
      '<div class="swap">' +
        (swap ? '<div class="swap-side"><span class="swap-label">Trocar</span>' + C.monChip(item.removed, { highlight: 'out', size: 56 }) + '</div><span class="swap-arrow" aria-hidden="true">⇄</span>' : '') +
        '<div class="swap-side"><span class="swap-label">' + (swap ? 'por' : 'Adicionar') + '</span>' + C.monChip(item.candidate, { highlight: 'in', size: 56 }) + '</div>' +
        '<div class="swap-score"><span>Novo score</span><b>' + fmt(item.after) + '</b>' + C.delta(item.after - item.before) + '</div>' +
      '</div>' +
      reasonsHtml(item.reasons) +
      '<div class="rec-actions"><button class="btn" data-action="compare" data-idx="' + idx + '">Comparar antes e depois</button>' +
      '<button class="btn primary" data-action="apply" data-idx="' + idx + '">' + (swap ? 'Aplicar troca' : 'Adicionar ao time') + '</button></div>' +
      '</article>';
  }

  /** Card compacto de sugestão. */
  function recCard(item, idx) {
    const swap = item.type === 'replace';
    return '<article class="rec">' +
      '<div class="rec-head">' + C.sprite(item.candidate, 56) +
        '<div class="rec-title"><b>' + esc(item.candidate.name) + '</b><span class="types">' + C.typeBadges(item.candidate.types, { small: true }) + '</span>' +
        (swap ? '<span class="rec-swap">no lugar de ' + esc(item.removed.name) + '</span>' : '') + '</div>' +
        '<div class="rec-score"><b>' + fmt(item.after) + '</b>' + C.delta(item.after - item.before) + '</div></div>' +
      reasonsHtml(item.reasons) +
      '<div class="rec-actions"><button class="btn ghost sm" data-action="compare" data-idx="' + idx + '">Antes × depois</button>' +
      '<button class="btn sm" data-action="apply" data-idx="' + idx + '">' + (swap ? 'Trocar' : 'Adicionar') + '</button></div></article>';
  }

  /** Comparação visual ANTES × DEPOIS (conteúdo do modal). */
  function compareHtml(cmp, item, ctx, showAll) {
    const b = cmp.before, a = cmp.after;
    const d = a.score.total - b.score.total;
    const changed = new Set(cmp.changedTypes);
    const rows = ctx.types.filter(function (t) { return showAll || changed.has(t); }).map(function (t) {
      const i = ctx.calc.index[t];
      const rb = b.analysis.defense[i], ra = a.analysis.defense[i];
      const before = rb.weak - rb.answers, after = ra.weak - ra.answers;
      const trend = after < before ? '<span class="trend up">melhorou</span>' : after > before ? '<span class="trend down">piorou</span>' : '<span class="trend flat">igual</span>';
      return '<tr><th scope="row">' + C.typeBadge(t) + '</th><td>' + C.dots(rb) + '</td><td>' + C.dots(ra) + '</td><td>' + trend + '</td></tr>';
    }).join('');
    const comps = a.score.components.map(function (c, i) {
      const cb = b.score.components[i];
      const dd = c.points - cb.points;
      return '<tr><th scope="row">' + esc(c.label) + '</th><td>' + cb.points.toFixed(1).replace('.', ',') + '</td><td>' + c.points.toFixed(1).replace('.', ',') + '</td><td>' + C.delta(dd) + '</td></tr>';
    }).join('');
    function teamRow(keys, mark, cls) {
      return '<div class="cmp-team">' + keys.map(function (k) {
        const p = ctx.get(k);
        return '<span class="cmp-mon' + (k === mark ? ' ' + cls : '') + '" title="' + esc(p.name) + '">' + C.sprite(p, 48) + '</span>';
      }).join('') + '</div>';
    }
    return '<div class="compare">' +
      '<div class="cmp-score"><div><span>Antes</span><b>' + b.score.total + '</b></div><span class="cmp-arrow" aria-hidden="true">→</span>' +
        '<div><span>Depois</span><b>' + a.score.total + '</b></div><div class="cmp-delta ' + (d >= 0 ? 'up' : 'down') + '">' + (d >= 0 ? '+' : '') + d + ' pontos</div></div>' +
      '<div class="cmp-teams"><div><h4>Antes</h4>' + teamRow(b.keys, item.removed ? item.removed.key : null, 'out') + '</div>' +
        '<div><h4>Depois</h4>' + teamRow(a.keys, item.candidate.key, 'in') + '</div></div>' +
      '<div class="cmp-cols">' +
        '<div><div class="cmp-subhead"><h4>Defesa por tipo</h4><label class="check"><input type="checkbox" data-action="toggle-all"' + (showAll ? ' checked' : '') + '> Mostrar os 18 tipos</label></div>' +
          (rows ? '<table class="cmp-table"><thead><tr><th></th><th>Antes</th><th>Depois</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' : '<p class="hint">Nenhuma mudança defensiva.</p>') + '</div>' +
        '<div><h4>Score por critério</h4><table class="cmp-table"><thead><tr><th></th><th>Antes</th><th>Depois</th><th></th></tr></thead><tbody>' + comps + '</tbody></table>' +
          reasonsHtml(item.reasons) + '</div>' +
      '</div>' +
      '<div class="rec-actions end"><button class="btn primary" data-action="apply-modal">' + (item.removed ? 'Aplicar troca' : 'Adicionar ao time') + '</button></div>' +
      '</div>';
  }

  /** Abre o modal de comparação para uma sugestão. */
  function openCompare(item, app) {
    const ctx = app.ctx;
    const cmp = E.compareTeams(app.team(), item.teamAfter, ctx, app.state.weights);
    const title = item.removed ? 'Trocar ' + item.removed.name + ' por ' + item.candidate.name : 'Adicionar ' + item.candidate.name;
    let showAll = false;
    const m = D.modal({ title: title, wide: true, html: compareHtml(cmp, item, ctx, showAll) });
    D.on(m.el, 'change', '[data-action="toggle-all"]', function () {
      showAll = !showAll;
      m.el.innerHTML = compareHtml(cmp, item, ctx, showAll);
    });
    D.on(m.el, 'click', '[data-action="apply-modal"]', function () {
      m.close();
      app.setTeam(item.teamAfter);
      D.toast(item.removed ? item.removed.name + ' trocado por ' + item.candidate.name : item.candidate.name + ' adicionado ao time', 'ok');
    });
  }

  const VISIBLE = 9;   // cards visíveis por lista antes de "Mostrar mais"
  const LIMIT = 30;    // sugestões calculadas por lista

  /** Grade de cards com botão "Mostrar mais". */
  function gridWithMore(list, items, id) {
    const html = list.map(function (it, i) {
      items.push(it);
      const card = recCard(it, items.length - 1);
      return i < VISIBLE ? card : card.replace('<article class="rec">', '<article class="rec" hidden>');
    }).join('');
    return '<div class="rec-grid" id="' + id + '">' + html + '</div>' +
      (list.length > VISIBLE ? '<div class="more-wrap"><button class="btn" data-more="' + id + '">Mostrar mais opções (' + (list.length - VISIBLE) + ')</button></div>' : '');
  }

  /** Renderiza a seção de recomendações (cálculo adiado para não travar a digitação). */
  function render(container, app) {
    const ctx = app.ctx;
    const keys = app.team();
    const opts = app.state.recOptions;
    const types = PTA.data.types;
    const hasMega = ctx.game.mechanics.megaEvolution && ctx.rules.maxMegasPerTeam > 0;
    const head = '<div class="panel-head"><h2>Como melhorar este time</h2>' +
      '<div class="head-actions">' +
      '<select data-opt="type" aria-label="Filtrar sugestões por tipo"><option value="">Qualquer tipo</option>' +
        types.order.map(function (t) { return '<option value="' + t + '"' + (opts.type === t ? ' selected' : '') + '>' + esc(types.meta[t].name) + '</option>'; }).join('') + '</select>' +
      '<label class="check"><input type="checkbox" data-opt="includeLegendary"' + (opts.includeLegendary ? ' checked' : '') + '> Lendários e míticos</label>' +
      (hasMega ? '<label class="check"><input type="checkbox" data-opt="includeMega"' + (opts.includeMega !== false ? ' checked' : '') + '> Megas</label>' : '') +
      '</div></div>';
    if (!keys.length) { container.innerHTML = ''; return; }
    container.innerHTML = '<section class="panel recs">' + head + '<div class="loading">Testando cada Pokémon de ' + esc(ctx.game.shortName) + ' no seu time…</div></section>';

    const token = (render._token = (render._token || 0) + 1);
    setTimeout(function () {
      if (token !== render._token) return;
      const poolOpts = { includeLegendary: !!opts.includeLegendary, includeMega: opts.includeMega !== false, type: opts.type || null, weights: app.state.weights };
      const items = [];
      let html = head;
      const teamSize = ctx.rules.teamSize || 6;
      const full = keys.length >= teamSize;

      if (!full) {
        const add = E.suggestAdditions(keys, ctx, Object.assign({ limit: LIMIT }, poolOpts));
        if (add.items.length) {
          items.push(add.items[0]);
          html += '<div class="hero-wrap">' + heroCard(add.items[0], 'Melhor Pokémon para adicionar', 0) + '</div>';
          html += '<h3 class="sub">Outras boas adições <span class="count">' + (add.items.length - 1) + '</span></h3>' + gridWithMore(add.items.slice(1), items, 'grid-add');
        }
      }
      const rep = E.suggestReplacements(keys, ctx, Object.assign({ limit: LIMIT, perMember: 3 }, poolOpts));
      if (rep.best.length) {
        if (full) {
          items.push(rep.best[0]);
          html += '<div class="hero-wrap">' + heroCard(rep.best[0], 'Melhor substituição encontrada', items.length - 1) + '</div>';
          html += '<h3 class="sub">Pokémon que podem melhorar seu time <span class="count">' + (rep.best.length - 1) + '</span></h3>' + gridWithMore(rep.best.slice(1), items, 'grid-rep');
        } else {
          html += '<h3 class="sub">Substituições <span class="count">' + rep.best.length + '</span></h3>' + gridWithMore(rep.best, items, 'grid-rep');
        }
        html += '<h3 class="sub">Melhores trocas para cada membro</h3><ul class="per-member">' + keys.map(function (k) {
          const list = rep.perMember[k] || [];
          if (!list.length) return '';
          const removed = list[0].removed;
          return '<li>' + C.monChip(removed, { size: 36 }) + '<span class="pm-arrow" aria-hidden="true">→</span><div class="pm-options">' +
            list.map(function (it) {
              items.push(it);
              return '<button class="pm-option" data-action="compare" data-idx="' + (items.length - 1) + '" title="Comparar antes e depois">' +
                C.sprite(it.candidate, 36) + '<span><b>' + esc(it.candidate.name) + '</b><span>' + fmt(it.after) + ' ' + C.delta(it.after - it.before) + '</span></span></button>';
            }).join('') + '</div></li>';
        }).join('') + '</ul>';
      } else if (full) {
        html += '<p class="hint big">Nenhuma troca isolada aumenta o score deste time com os filtros atuais.</p>';
      }

      container.innerHTML = '<section class="panel recs">' + html + '</section>';
      container._items = items;
    }, 30);

    if (!container._bound) {
      container._bound = true;
      D.on(container, 'click', '[data-action]', function (e, el) {
        const item = container._items && container._items[Number(el.dataset.idx)];
        if (!item) return;
        if (el.dataset.action === 'compare') openCompare(item, app);
        if (el.dataset.action === 'apply') {
          app.setTeam(item.teamAfter);
          D.toast(item.removed ? item.removed.name + ' trocado por ' + item.candidate.name : item.candidate.name + ' adicionado ao time', 'ok');
        }
      });
      D.on(container, 'click', '[data-more]', function (e, el) {
        const hidden = D.$$('#' + el.dataset.more + ' > .rec[hidden]', container);
        hidden.slice(0, VISIBLE).forEach(function (c) { c.hidden = false; });
        const left = hidden.length - VISIBLE;
        if (left > 0) el.textContent = 'Mostrar mais opções (' + left + ')'; else el.parentNode.remove();
      });
      D.on(container, 'change', '[data-opt]', function (e, el) {
        app.state.recOptions[el.dataset.opt] = el.type === 'checkbox' ? el.checked : el.value;
        app.save();
        render(container, app);
      });
    }
  }

  PTA.ui.recommendationView = { render: render, openCompare: openCompare };
})(PTA);
