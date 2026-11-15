/**
 * generatorView — geração dos melhores times equilibrados do jogo.
 */
(function (PTA) {
  'use strict';

  const D = PTA.ui.dom, C = PTA.ui.c, E = PTA.engine, esc = D.esc;
  const MEDALS = ['🥇', '🥈', '🥉'];

  function optionsHtml(app) {
    const ctx = app.ctx, o = app.state.genOptions;
    const gameHasMega = ctx.game.mechanics.megaEvolution;
    const team = app.team();
    return '<section class="panel gen-options">' +
      '<div class="panel-head"><h2>Gerar times equilibrados</h2></div>' +
      '<p class="panel-sub">Busca completa: o gerador avalia dezenas de milhares de combinações de Pokémon de ' + esc(ctx.game.shortName) +
      ' e mostra os 10 times com maior Team Score, sem resultados quase iguais. Depois é possível pedir mais 10 de cada vez.</p>' +
      '<div class="opt-grid">' +
        '<fieldset><legend>Tipo de time</legend><div class="seg seg-col">' +
          Object.keys(E.GENERATOR_OBJECTIVES).map(function (k) {
            const desc = { score: 'Melhor equilíbrio geral', coverage: 'Acerta mais tipos com vantagem', defense: 'Menos fraquezas, mais resistências e imunidades' }[k];
            return '<label><input type="radio" name="objective" value="' + k + '"' + ((o.objective || 'score') === k ? ' checked' : '') + '><span><b>' + esc(E.GENERATOR_OBJECTIVES[k].label) + '</b><small>' + desc + '</small></span></label>';
          }).join('') + '</div></fieldset>' +
        '<fieldset><legend>Pool de Pokémon</legend>' +
          '<label class="check"><input type="checkbox" data-gen="includeLegendary"' + (o.includeLegendary ? ' checked' : '') + '> Incluir lendários e míticos</label>' +
          (gameHasMega ? '<label class="check"><input type="checkbox" data-gen="includeMega"' + (o.includeMega !== false ? ' checked' : '') + '> Incluir Megas (máx. ' + (ctx.game.rules.maxMegasPerTeam || 0) + ' por time)</label>' +
            '<label class="check"><input type="checkbox" data-action="mega-unlimited"' + (app.state.megaUnlimited ? ' checked' : '') + '> Megas sem limite</label>' : '') +
          '<label class="check"><input type="checkbox" data-gen="skipWeak"' + (o.skipWeak !== false ? ' checked' : '') + '> Ignorar Pokémon com stats baixos para o jogo</label>' +
        '</fieldset>' +
        '<fieldset><legend>Base</legend>' +
          '<label class="check"><input type="checkbox" data-gen="useLocked"' + (o.useLocked && team.length ? ' checked' : '') + (team.length ? '' : ' disabled') + '> Completar o meu time atual' + (team.length ? ' (' + team.length + ' fixos)' : '') + '</label>' +
          (team.length ? '<div class="locked">' + team.map(function (k) { const p = ctx.get(k); return p ? C.sprite(p, 32) : ''; }).join('') + '</div>' : '<p class="hint">Monte um time na aba Analisar para usá-lo como base.</p>') +
        '</fieldset>' +
      '</div>' +
      '<div class="gen-run"><button class="btn primary lg" data-action="generate">Gerar times</button>' +
      '<div class="progress" hidden><div class="progress-bar"><i></i></div><span class="progress-text"></span></div></div>' +
      '</section>';
  }

  /** Destaque do objetivo escolhido (cobertura / resistência). */
  function focusHtml(t) {
    const f = t.focus;
    if (t.objective === 'coverage') {
      return '<p class="focus">Cobertura: STAB super efetivo contra <b>' + f.superEffectiveTypes + '/18 tipos</b> e <b>' + f.comboCoverage + '%</b> das combinações de tipo do jogo.</p>';
    }
    if (t.objective === 'defense') {
      return '<p class="focus">Resistência: <b>' + (18 - f.uncoveredTypes) + '/18 tipos</b> com alguém que resiste, <b>' + f.immunityTypes + '</b> imunidades distintas, <b>' + f.stackedWeaknesses + '</b> fraquezas acumuladas.</p>';
    }
    return '';
  }

  function teamCard(t, ctx, i) {
    const members = ctx.resolve(t.keys);
    const g = C.grade(t.score);
    return '<article class="team-card" data-idx="' + i + '">' +
      '<div class="team-card-head">' +
        '<h3><span class="medal" aria-hidden="true">' + (MEDALS[i] || '') + '</span> Time #' + (i + 1) + '</h3>' +
        '<div class="team-score g-' + g.cls + '"><b>' + t.score + '</b><span>/100</span></div>' +
      '</div>' +
      '<div class="team-mons">' + members.map(function (p) {
        return '<div class="team-mon">' + C.sprite(p, 64) + '<b>' + esc(p.name) + '</b><span class="types">' + C.typeBadges(p.types, { small: true, short: true }) + '</span></div>';
      }).join('') + '</div>' +
      focusHtml(t) +
      '<div class="team-pills">' + t.scoreDetail.components.map(function (c) {
        return '<span class="pill" title="' + esc(c.label) + '"><span>' + esc(c.label) + '</span><b>' + Math.round(c.points) + '/' + Math.round(c.max) + '</b></span>';
      }).join('') + '</div>' +
      '<div class="team-sw">' +
        '<div><h4>Pontos fortes</h4><ul class="reasons">' + t.summary.strengths.map(function (s) { return '<li class="pro">' + esc(s) + '</li>'; }).join('') + '</ul></div>' +
        '<div><h4>Pontos fracos</h4><ul class="reasons">' + (t.summary.weaknesses.length ? t.summary.weaknesses.map(function (s) { return '<li class="con">' + esc(s) + '</li>'; }).join('') : '<li class="pro">Nenhum ponto fraco relevante</li>') + '</ul></div>' +
      '</div>' +
      '<div class="rec-actions"><button class="btn" data-action="detail" data-idx="' + i + '">Ver análise detalhada</button>' +
      '<button class="btn primary" data-action="use" data-idx="' + i + '">Usar este time</button></div>' +
      '</article>';
  }

  function resultsHtml(app) {
    const res = app.state.genResults;
    if (!res || res.gameId !== app.ctx.gameId || !res.teams.length) return '';
    const m = res.session.stats();
    return '<section class="gen-results">' +
      '<div class="gen-results-head"><h2>' + esc(E.GENERATOR_OBJECTIVES[res.teams[0].objective].label) + ': melhores times</h2>' +
      '<p>' + res.teams.length + ' times mostrados. ' + m.evaluated.toLocaleString('pt-BR') + ' combinações avaliadas em ' + (m.elapsedMs / 1000).toFixed(1).replace('.', ',') + ' s, a partir de ' + m.poolSize + ' candidatos.</p>' +
      '<button class="btn ghost sm" data-action="reroll">Nova busca com outra semente</button></div>' +
      '<div id="team-list">' + res.teams.map(function (t, i) { return teamCard(t, app.ctx, i); }).join('') + '</div>' +
      '<div class="more-wrap"><button class="btn primary" data-action="more">Gerar mais 10 times</button></div>' +
      '</section>';
  }

  /** Renderiza a aba de geração. */
  function render(container, app) {
    container.innerHTML = '<div class="gen">' + optionsHtml(app) + '<div id="gen-results">' + resultsHtml(app) + '</div></div>';
    const o = app.state.genOptions;

    D.on(container, 'change', 'input', function (e, el) {
      if (el.dataset.gen) o[el.dataset.gen] = el.checked;
      if (el.name === 'objective') o.objective = el.value;
      app.save();
    });

    function setBusy(busy) {
      const prog = container.querySelector('.progress');
      container.querySelectorAll('[data-action="generate"], [data-action="more"], [data-action="reroll"]').forEach(function (b) { b.disabled = busy; });
      prog.hidden = !busy;
    }
    function onProgress(p) {
      const prog = container.querySelector('.progress');
      prog.querySelector('i').style.setProperty('--w', p.percent + '%');
      prog.querySelector('.progress-text').textContent = p.phase + ', ' + p.percent + '%';
    }

    async function run(seedBump) {
      setBusy(true);
      if (seedBump) o.seed = (o.seed || 1) + 1;
      try {
        const session = E.createGenerationSession(app.ctx, {
          objective: o.objective || 'score',
          includeLegendary: !!o.includeLegendary, includeMega: o.includeMega !== false,
          skipWeak: o.skipWeak !== false, locked: o.useLocked ? app.team() : [], seed: o.seed || 1, weights: app.state.weights,
        });
        await session.run(onProgress);
        const teams = session.next(10);
        app.state.genResults = { gameId: app.ctx.gameId, teams: teams, session: session };
        container.querySelector('#gen-results').innerHTML = resultsHtml(app);
        container.querySelector('.gen-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) {
        D.toast(err.message, 'error');
      } finally {
        setBusy(false);
      }
    }

    async function loadMore() {
      const res = app.state.genResults;
      if (!res) return;
      setBusy(true);
      try {
        const start = res.teams.length;
        const extra = await res.session.more(10, onProgress);
        if (!extra.length) { D.toast('Não há mais times diferentes o suficiente com estes filtros.', 'error'); return; }
        res.teams = res.teams.concat(extra);
        container.querySelector('#gen-results').innerHTML = resultsHtml(app);
        const card = container.querySelectorAll('.team-card')[start];
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) {
        D.toast(err.message, 'error');
      } finally {
        setBusy(false);
      }
    }

    D.on(container, 'click', '[data-action]', function (e, el) {
      const a = el.dataset.action;
      const res = app.state.genResults;
      if (a === 'generate') run(false);
      else if (a === 'reroll') run(true);
      else if (a === 'more') loadMore();
      else if (a === 'mega-unlimited') { app.setMegaUnlimited(el.checked); }
      else if (a === 'use' && res) {
        app.setTeam(res.teams[Number(el.dataset.idx)].keys);
        app.go('analisar');
        D.toast('Time carregado no construtor', 'ok');
      } else if (a === 'detail' && res) {
        const t = res.teams[Number(el.dataset.idx)];
        const m = D.modal({ title: 'Time #' + (Number(el.dataset.idx) + 1) + ', análise detalhada', wide: true,
          html: '<div class="detail-actions"><button class="btn primary" data-use>Usar este time</button></div>' +
            PTA.ui.analysisView.renderAnalysis(app.ctx.resolve(t.keys), app.ctx, { weights: app.state.weights }) });
        m.el.querySelector('[data-use]').addEventListener('click', function () {
          m.close(); app.setTeam(t.keys); app.go('analisar');
        });
      }
    });
  }

  PTA.ui.generatorView = { render: render };
})(PTA);
