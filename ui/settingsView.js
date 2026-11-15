/**
 * settingsView — conteúdos do jogo (DLC/transferência) e pesos do Team Score.
 */
(function (PTA) {
  'use strict';

  const D = PTA.ui.dom, E = PTA.engine, esc = D.esc;

  function weightsHtml(app) {
    const w = app.state.weights || E.scoringConfig.weights;
    const norm = E.normalizedWeights(w);
    return E.SCORE_COMPONENTS.map(function (c) {
      return '<div class="weight">' +
        '<div class="weight-top"><label for="w-' + c.id + '">' + esc(c.label) + '</label><span class="weight-val" id="wv-' + c.id + '">' + Math.round(norm[c.id]) + ' pts</span></div>' +
        '<input type="range" id="w-' + c.id + '" min="0" max="40" step="1" value="' + (w[c.id] || 0) + '" data-w="' + c.id + '">' +
        '<p>' + esc(c.help) + '</p></div>';
    }).join('');
  }

  function render(container, app) {
    const ctx = app.ctx, g = ctx.game;
    container.innerHTML =
      '<div class="settings">' +
      '<section class="panel">' +
        '<div class="panel-head"><h2>Conteúdo de ' + esc(g.shortName) + '</h2></div>' +
        '<p class="panel-sub">Escolha de onde podem vir os Pokémon usados na busca, nas sugestões e no gerador.</p>' +
        '<ul class="pack-toggles">' + ctx.packs.map(function (p, i) {
          const count = ctx.availability.entries.filter(function (e) { return e[1] === p.id; }).length;
          return '<li><label class="check"><input type="checkbox" data-pack="' + p.id + '"' + (p.enabled ? ' checked' : '') + (i === 0 ? ' disabled' : '') + '> ' + esc(p.label) +
            ' <span class="muted">(' + count + ')</span></label></li>';
        }).join('') + '</ul>' +
        '<h3 class="sub">Regras deste jogo</h3><ul class="rules">' +
          '<li>Tabela de tipos: ' + esc(PTA.data.typeCharts[g.typeChart].label) + '</li>' +
          '<li>Efetividade: ' + (g.effectiveness === 'legends-arceus' ? 'Legends: Arceus (fraqueza dupla 2,5×, resistência dupla 0,4×)' : 'padrão (4× / ¼×)') + '</li>' +
          '<li>Mega Evolução: ' + (g.mechanics.megaEvolution ? (app.state.megaUnlimited ? 'sim, sem limite por time (sua escolha)' : 'sim, até ' + g.rules.maxMegasPerTeam + ' por time') : 'não') + '</li>' +
          '<li>Species Clause (sem espécies repetidas): ' + (g.rules.speciesClause ? 'sim' : 'não') + '</li>' +
          (g.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') +
        '</ul>' +
        (g.mechanics.megaEvolution ? '<label class="check"><input type="checkbox" data-action="mega-unlimited"' + (app.state.megaUnlimited ? ' checked' : '') + '> Megas sem limite por time</label>' : '') +
      '</section>' +
      '<section class="panel">' +
        '<div class="panel-head"><h2>Pesos do Team Score</h2><button class="btn ghost sm" data-action="reset">Restaurar padrão</button></div>' +
        '<p class="panel-sub">Os pesos são normalizados para somar 100. Valem para a análise, as sugestões e o gerador. O padrão fica em engine/scoringConfig.js.</p>' +
        '<div class="weights">' + weightsHtml(app) + '</div>' +
      '</section>' +
      '<section class="panel how">' +
        '<div class="panel-head"><h2>Como a análise funciona</h2></div>' +
        '<p><b>Cobertura e defesa.</b> Para cada um dos 18 tipos de ataque, o app calcula o dano que cada membro recebe com a tabela e as regras do jogo escolhido, e conta fracos, resistentes, imunes e neutros. A ofensiva usa os tipos do próprio Pokémon (STAB), contra os tipos puros e contra as combinações que realmente existem no jogo.</p>' +
        '<p><b>Ameaças.</b> Os 40 Pokémon totalmente evoluídos mais fortes do jogo (sem lendários) são testados contra o seu time: alguém resiste aos tipos deles, ou os vence sem ser fraco?</p>' +
        '<p><b>Sugestões.</b> Cada Pokémon disponível é colocado no time (ou no lugar de cada membro) e o Team Score é recalculado. Os motivos mostrados vêm da diferença entre as análises antes e depois.</p>' +
        '<p><b>Gerador.</b> Beam search monta os times membro a membro guardando os melhores parciais; depois uma busca local tenta trocar cada membro enquanto o score sobe; por fim, os resultados são filtrados para não repetirem quase os mesmos Pokémon.</p>' +
      '</section></div>';

    D.on(container, 'change', '[data-pack]', function () {
      const packs = D.$$('[data-pack]', container).filter(function (x) { return x.checked; }).map(function (x) { return x.dataset.pack; });
      app.setPacks(packs);
      D.toast('Conteúdo atualizado', 'ok');
    });
    D.on(container, 'input', '[data-w]', function (e, el) {
      const w = Object.assign({}, app.state.weights || E.scoringConfig.weights);
      w[el.dataset.w] = Number(el.value);
      app.setWeights(w);
      const norm = E.normalizedWeights(w);
      E.SCORE_COMPONENTS.forEach(function (c) { container.querySelector('#wv-' + c.id).textContent = Math.round(norm[c.id]) + ' pts'; });
    });
    D.on(container, 'change', '[data-action="mega-unlimited"]', function (e, el) { app.setMegaUnlimited(el.checked); });
    D.on(container, 'click', '[data-action="reset"]', function () {
      app.setWeights(null);
      container.querySelector('.weights').innerHTML = weightsHtml(app);
      D.toast('Pesos restaurados', 'ok');
    });
  }

  PTA.ui.settingsView = { render: render };
})(PTA);
