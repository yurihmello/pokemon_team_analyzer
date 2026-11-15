/**
 * quickView — "Resumo do time": versão simples e interativa da análise.
 *
 * - Mostra os membros e os espaços vazios do time.
 * - Lista as fraquezas mais preocupantes e os tipos que o STAB ainda não acerta.
 * - Sugere Pokémon que podem ser arrastados para os espaços (ou clicados).
 *   Passar o mouse/arrastar uma sugestão mostra uma PRÉVIA de como as fraquezas
 *   e a cobertura ficariam com ela no time.
 */
(function (PTA) {
  'use strict';

  const D = PTA.ui.dom, C = PTA.ui.c, E = PTA.engine, esc = D.esc;
  const PAGE_SIZE = 10;     // sugestões por página
  const SUGGESTIONS = 60;   // total calculado (6 páginas)

  function tn(t) { return PTA.data.types.meta[t].name; }

  /** Fraquezas ordenadas por gravidade (somente as que preocupam). */
  function worries(analysis) {
    return analysis.defense
      .filter(function (d) { return d.weak > 0 && (d.weak > d.answers || d.weak >= 2); })
      .sort(function (a, b) { return (b.weak - b.answers) - (a.weak - a.answers) || b.weak - a.weak; });
  }

  function slotsHtml(members, ctx, preview) {
    const size = ctx.rules.teamSize || 6;
    let html = '';
    let ghostUsed = false;
    for (let i = 0; i < size; i++) {
      const p = members[i];
      const replaced = preview && preview.removed && p && preview.removed.key === p.key;
      if (p) {
        html += '<div class="q-slot filled' + (replaced ? ' leaving' : '') + '" data-drop-replace="' + esc(p.key) + '">' +
          C.sprite(replaced ? preview.candidate : p, 56) + '<b>' + esc(replaced ? preview.candidate.name : p.name) + '</b>' +
          '<span class="types">' + C.typeBadges((replaced ? preview.candidate : p).types, { small: true }) + '</span>' +
          (replaced ? '<span class="q-note">no lugar de ' + esc(p.name) + '</span>' : '<button class="icon-btn q-remove" data-q-remove="' + esc(p.key) + '" aria-label="Remover ' + esc(p.name) + '">✕</button>') +
          '</div>';
      } else if (preview && !preview.removed && !ghostUsed) {
        ghostUsed = true;
        html += '<div class="q-slot ghost" data-drop="1">' + C.sprite(preview.candidate, 56) + '<b>' + esc(preview.candidate.name) + '</b><span class="q-note">prévia</span></div>';
      } else {
        html += '<div class="q-slot empty" data-drop="1"><span>Arraste uma sugestão para cá</span></div>';
      }
    }
    return html;
  }

  function columnsHtml(ctx, members, previewMembers) {
    const now = E.analyzeTeam(members, ctx);
    const after = previewMembers ? E.analyzeTeam(previewMembers, ctx) : null;
    const shown = after || now;

    // Fraquezas: mostra as preocupantes do estado exibido (e as que deixaram de ser, na prévia).
    const list = worries(shown);
    const fixed = after ? worries(now).filter(function (d) { return !list.some(function (x) { return x.type === d.type; }); }) : [];
    const rows = list.map(function (d) {
      const before = now.defense[ctx.calc.index[d.type]];
      let change = '';
      if (after) {
        const b = before.weak - before.answers, a = d.weak - d.answers;
        change = a < b ? '<span class="trend up">melhora</span>' : a > b ? '<span class="trend down">piora</span>' : '';
      }
      const sev = d.weak >= 3 && d.answers <= 1 ? 'danger' : d.weak > d.answers ? 'warning' : 'ok';
      return '<li class="q-weak sev-' + sev + '">' + C.typeBadge(d.type) + C.dots(d) +
        '<span class="q-text">' + d.weak + ' fraco' + (d.weak > 1 ? 's' : '') + ', ' + d.answers + ' resiste' + (d.answers === 1 ? '' : 'm') + '</span>' + change + '</li>';
    }).join('') + fixed.map(function (d) {
      return '<li class="q-weak sev-fixed">' + C.typeBadge(d.type) + '<span class="q-text">deixa de ser um problema</span><span class="trend up">resolvido</span></li>';
    }).join('');

    // STAB que falta.
    const missing = shown.offense.filter(function (o) { return o.best < 2; });
    const gained = after ? now.offense.filter(function (o, i) { return o.best < 2 && after.offense[i].best >= 2; }) : [];
    const covered = 18 - missing.length;

    return '<div class="q-col"><h3>Fraquezas que mais preocupam</h3>' +
        (members.length || previewMembers ? (rows ? '<ul class="q-list">' + rows + '</ul>' : '<p class="hint">Nenhum tipo acerta mais Pokémon do time do que os que resistem.</p>') : '<p class="hint">Adicione Pokémon para ver.</p>') +
      '</div>' +
      '<div class="q-col"><h3>STAB super efetivo que ainda falta</h3>' +
        '<p class="q-meter"><b>' + covered + '/18</b> tipos já são atingidos com vantagem pelos tipos do time.</p>' +
        '<div class="q-bar"><i style="--w:' + (covered / 18 * 100).toFixed(1) + '%"></i></div>' +
        (missing.length ? '<div class="q-types">' + missing.map(function (o) { return C.typeBadge(o.type); }).join('') + '</div>' : '<p class="hint">Cobertura completa: todos os 18 tipos.</p>') +
        (gained.length ? '<p class="q-gain">Com a prévia passa a cobrir: ' + gained.map(function (o) { return C.typeBadge(o.type, { small: true }); }).join(' ') + '</p>' : '') +
      '</div>';
  }

  function suggestionChip(item, idx) {
    const p = item.candidate;
    return '<button class="q-sug" draggable="true" data-sug="' + idx + '" title="' + (item.removed ? 'Trocar ' + esc(item.removed.name) + ' por ' + esc(p.name) : 'Adicionar ' + esc(p.name)) + '">' +
      C.sprite(p, 44) + '<span class="q-sug-text"><b>' + esc(p.name) + '</b><span class="types">' + C.typeBadges(p.types, { small: true }) + '</span>' +
      (item.removed ? '<span class="q-note">no lugar de ' + esc(item.removed.name) + '</span>' : '') + '</span>' +
      C.delta(item.after - item.before) + '</button>';
  }

  /** Renderiza o resumo no container. */
  function render(container, app) {
    const ctx = app.ctx;
    const members = ctx.resolve(app.team());
    const full = members.length >= (ctx.rules.teamSize || 6);
    container.innerHTML =
      '<section class="panel quick">' +
        '<div class="panel-head"><h2>Resumo do time</h2>' +
        '<span class="hint q-hint-mouse">' + (full ? 'Arraste uma sugestão sobre um membro para trocá-lo.' : 'Arraste ou clique numa sugestão. Passe o mouse para ver a prévia.') + '</span>' +
        '<span class="hint q-hint-touch">Toque numa sugestão para ver a prévia; toque de novo para ' + (full ? 'trocar' : 'adicionar') + '.</span></div>' +
        '<div class="q-slots" id="q-slots">' + slotsHtml(members, ctx, null) + '</div>' +
        '<h3 class="sub q-sub">' + (full ? 'Trocas sugeridas' : 'Sugestões para completar o time') + '</h3>' +
        '<div class="q-sugs-wrap">' +
          '<button class="q-nav" data-q-page="-1" aria-label="10 sugestões anteriores" disabled>‹</button>' +
          '<div class="q-sugs" id="q-sugs"><p class="hint">Calculando sugestões…</p></div>' +
          '<button class="q-nav" data-q-page="1" aria-label="Próximas 10 sugestões" disabled>›</button>' +
        '</div>' +
        '<p class="q-page" id="q-page"></p>' +
        '<div class="q-cols" id="q-cols">' + columnsHtml(ctx, members, null) + '</div>' +
      '</section>';

    let items = [];
    let page = 0;
    const recOpts = app.state.recOptions;

    /** Mostra a página atual de sugestões (10 por vez) e atualiza as setas. */
    function showPage() {
      const box = container.querySelector('#q-sugs');
      if (!box) return;
      const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
      page = Math.min(Math.max(0, page), pages - 1);
      const start = page * PAGE_SIZE, end = Math.min(items.length, start + PAGE_SIZE);
      box.innerHTML = items.length
        ? items.slice(start, end).map(function (it, i) { return suggestionChip(it, start + i); }).join('')
        : '<p class="hint">Nenhuma sugestão melhora o time com os filtros atuais.</p>';
      container.querySelector('[data-q-page="-1"]').disabled = page === 0;
      container.querySelector('[data-q-page="1"]').disabled = page >= pages - 1;
      container.querySelector('#q-page').textContent = items.length ? 'Sugestões ' + (start + 1) + ' a ' + end + ' de ' + items.length + ' (página ' + (page + 1) + ' de ' + pages + ')' : '';
    }

    setTimeout(function () {
      const opts = { includeLegendary: !!recOpts.includeLegendary, includeMega: recOpts.includeMega !== false, weights: app.state.weights, limit: SUGGESTIONS };
      items = full ? E.suggestReplacements(app.team(), ctx, opts).best : E.suggestAdditions(app.team(), ctx, opts).items;
      showPage();
    }, 20);

    D.on(container, 'click', '[data-q-page]', function (e, el) {
      page += Number(el.dataset.qPage);
      preview(null);
      showPage();
    });

    let current = null;
    function preview(item) {
      if (item === current) return;
      current = item;
      const slots = container.querySelector('#q-slots'), cols = container.querySelector('#q-cols');
      if (!item) {
        slots.innerHTML = slotsHtml(members, ctx, null);
        cols.innerHTML = columnsHtml(ctx, members, null);
        container.classList.remove('previewing');
        return;
      }
      const after = ctx.resolve(item.teamAfter);
      slots.innerHTML = slotsHtml(members, ctx, item);
      cols.innerHTML = columnsHtml(ctx, members, after);
      container.classList.add('previewing');
    }

    /** Aplica uma sugestão; `targetKey` = membro sobre o qual foi solta (troca). */
    function apply(item, targetKey) {
      let keys = app.team();
      if (targetKey) {
        if (!ctx.canJoin(members, item.candidate, targetKey)) { D.toast(item.candidate.name + ' não pode substituir esse membro (espécie repetida ou limite de Megas).', 'error'); return; }
        keys = keys.map(function (k) { return k === targetKey ? item.candidate.key : k; });
      } else {
        keys = item.teamAfter;
      }
      app.setTeam(keys);
    }

    let dragging = null;
    // Toque (celular): não existe "passar o mouse" nem arrastar nativo.
    // 1º toque numa sugestão = prévia; 2º toque na mesma = adicionar/trocar.
    let lastPointer = window.matchMedia && window.matchMedia('(hover: none)').matches ? 'touch' : 'mouse';
    container.addEventListener('pointerdown', function (e) { if (e.pointerType) lastPointer = e.pointerType; }, true);
    container.addEventListener('touchstart', function () { lastPointer = 'touch'; }, { capture: true, passive: true });
    D.on(container, 'mouseover', '[data-sug]', function (e, el) { if (!dragging && lastPointer === 'mouse') preview(items[Number(el.dataset.sug)]); });
    D.on(container, 'focusin', '[data-sug]', function (e, el) { if (lastPointer === 'mouse') preview(items[Number(el.dataset.sug)]); });
    container.addEventListener('mouseleave', function () { if (!dragging && lastPointer === 'mouse') preview(null); });
    D.on(container, 'mouseout', '#q-sugs', function (e) { if (!dragging && lastPointer === 'mouse' && !e.relatedTarget?.closest?.('[data-sug]')) preview(null); });
    D.on(container, 'click', '[data-sug]', function (e, el) {
      const item = items[Number(el.dataset.sug)];
      if (lastPointer !== 'mouse' && current !== item) {
        preview(item);
        D.$$('.q-sug.armed', container).forEach(function (x) { x.classList.remove('armed'); });
        el.classList.add('armed');
        return;
      }
      apply(item);
    });
    D.on(container, 'click', '[data-q-remove]', function (e, el) { app.removeFromTeam(el.dataset.qRemove); });

    // Arrastar e soltar.
    D.on(container, 'dragstart', '[data-sug]', function (e, el) {
      dragging = items[Number(el.dataset.sug)];
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', dragging.candidate.key);
      preview(dragging);
    });
    container.addEventListener('dragend', function () { dragging = null; preview(null); });
    container.addEventListener('dragover', function (e) {
      if (!dragging) return;
      const target = e.target.closest('[data-drop], [data-drop-replace]');
      if (target) { e.preventDefault(); D.$$('.q-slot.over', container).forEach(function (x) { x.classList.remove('over'); }); target.classList.add('over'); }
    });
    container.addEventListener('drop', function (e) {
      if (!dragging) return;
      const target = e.target.closest('[data-drop], [data-drop-replace]');
      if (!target) return;
      e.preventDefault();
      const item = dragging;
      dragging = null;
      if (target.dataset.dropReplace) apply(item, target.dataset.dropReplace);
      else if (!full) apply(item);
    });
  }

  PTA.ui.quickView = { render: render };
})(PTA);
