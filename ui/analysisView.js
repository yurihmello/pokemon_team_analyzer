/**
 * analysisView — visualização da análise de um time.
 * Usada na aba "Analisar time" e no detalhe dos times gerados.
 */
(function (PTA) {
  'use strict';

  const D = PTA.ui.dom, C = PTA.ui.c, E = PTA.engine, esc = D.esc;

  function tn(t) { return PTA.data.types.meta[t].name; }
  function fmt(n) { return (Math.round(n * 10) / 10).toFixed(1).replace('.', ','); }

  /** Tela de score: anel + nota + composição transparente do número. */
  function scoreScreen(score, members, ctx) {
    const g = C.grade(score.total);
    const rows = score.components.map(function (c) {
      const pct = c.max ? (c.points / c.max) * 100 : 0;
      return '<li class="bd-row">' +
        '<div class="bd-top"><span class="bd-label" title="' + esc(c.help) + '">' + esc(c.label) + '</span>' +
        '<span class="bd-points"><b>' + fmt(c.points) + '</b> / ' + fmt(c.max) + '</span></div>' +
        '<div class="bd-bar"><i style="--w:' + pct.toFixed(1) + '%"></i></div>' +
        (c.explain ? '<p class="bd-explain">' + esc(c.explain) + '</p>' : '') +
        '</li>';
    }).join('');
    return '<section class="screen" aria-label="Team Score">' +
      '<div class="screen-score">' + C.scoreRing(score.total, 148) +
        '<div class="screen-grade g-' + g.cls + '"><span class="grade-letter">' + g.letter + '</span><span>' + esc(g.label) + '</span></div>' +
        '<p class="screen-note">' + members.length + ' de ' + (ctx.rules.teamSize || 6) + ' Pokémon, regras de ' + esc(ctx.game.shortName) + '.</p>' +
      '</div>' +
      '<div class="screen-breakdown"><h3>De onde vem o score</h3>' +
        '<ol class="breakdown">' + rows + '</ol>' +
        '<p class="formula">Team Score = soma dos pontos de cada critério. Cada critério vale de 0 até o seu peso; os pesos podem ser ajustados em Ajustes.</p>' +
      '</div></section>';
  }

  /** Lista de problemas e pontos fortes. */
  function insightsBlock(insights) {
    const bad = insights.filter(function (i) { return i.level === 'danger' || i.level === 'warning'; });
    const good = insights.filter(function (i) { return i.level === 'good'; });
    const info = insights.filter(function (i) { return i.level === 'info'; });
    function item(i) {
      return '<li class="insight lv-' + i.level + '"><span class="insight-icon" aria-hidden="true">' + i.icon + '</span>' +
        '<div><b>' + esc(i.title) + '</b><p>' + esc(i.text) + '</p></div></li>';
    }
    return '<section class="panel"><div class="panel-head"><h2>Diagnóstico</h2></div>' +
      '<div class="insight-cols">' +
        '<div><h3 class="col-title bad">Problemas encontrados <span class="count">' + bad.length + '</span></h3>' +
          (bad.length ? '<ul class="insights">' + bad.map(item).join('') + '</ul>' : '<p class="hint">Nenhum problema relevante.</p>') + '</div>' +
        '<div><h3 class="col-title good">Pontos fortes <span class="count">' + good.length + '</span></h3>' +
          (good.length ? '<ul class="insights">' + good.map(item).join('') + '</ul>' : '<p class="hint">Adicione mais Pokémon para ver os pontos fortes.</p>') + '</div>' +
      '</div>' +
      (info.length ? '<details class="more"><summary>Observações (' + info.length + ')</summary><ul class="insights">' + info.map(item).join('') + '</ul></details>' : '') +
      '</section>';
  }

  /** Estado de risco de uma linha da tabela defensiva. */
  function rowStatus(d) {
    if (d.weak >= 3 && d.answers <= 1) return { cls: 'danger', label: 'Crítico' };
    if (d.weak >= 2 && d.answers === 0) return { cls: 'warning', label: 'Atenção' };
    if (d.weak > d.answers) return { cls: 'warning', label: 'Atenção' };
    if (d.weak === 0 && d.answers >= 3) return { cls: 'good', label: 'Ótimo' };
    return { cls: 'ok', label: 'Ok' };
  }

  /** Tabela visual de fraquezas/resistências (18 tipos × membros). */
  function defenseTable(analysis, ctx) {
    const members = analysis.members;
    const head = '<tr><th scope="col" class="th-type">Ataque</th>' + members.map(function (p) {
      return '<th scope="col" class="th-mon" title="' + esc(p.name) + '">' + C.sprite(p, 40) + '<span class="sr-only">' + esc(p.name) + '</span></th>';
    }).join('') + '<th scope="col" class="th-dots">Time</th><th scope="col">Resumo</th></tr>';
    const body = analysis.defense.map(function (d) {
      const st = rowStatus(d);
      const summary = [];
      if (d.weak) summary.push(d.weak + ' fraco' + (d.weak > 1 ? 's' : ''));
      if (d.resist) summary.push(d.resist + ' resiste' + (d.resist > 1 ? 'm' : ''));
      if (d.immune) summary.push(d.immune + ' imune' + (d.immune > 1 ? 's' : ''));
      if (d.neutral) summary.push(d.neutral + ' neutro' + (d.neutral > 1 ? 's' : ''));
      return '<tr class="row-' + st.cls + '"><th scope="row">' + C.typeBadge(d.type) + '</th>' +
        d.members.map(function (m) { return C.multCell(m.mult); }).join('') +
        '<td class="td-dots">' + C.dots(d) + '</td>' +
        '<td class="td-summary"><span class="status st-' + st.cls + '">' + st.label + '</span> ' + summary.join(', ') + '</td></tr>';
    }).join('');
    return '<section class="panel"><div class="panel-head"><h2>Defesa por tipo</h2>' +
      '<div class="legend"><span><i class="dot resist"></i>resiste</span><span><i class="dot immune"></i>imune</span><span><i class="dot weak"></i>fraco</span><span><i class="dot neutral"></i>neutro</span></div></div>' +
      '<p class="panel-sub">Dano que cada Pokémon recebe de um ataque de cada tipo' + (ctx.game.effectiveness === 'legends-arceus' ? ' (regras de Legends: Arceus: fraqueza dupla = 2,5×)' : '') + '.</p>' +
      '<div class="table-scroll"><table class="deftable">' + '<thead>' + head + '</thead><tbody>' + body + '</tbody></table></div></section>';
  }

  /** Grade de cobertura ofensiva (STAB) contra os 18 tipos. */
  function offenseGrid(analysis, ctx) {
    const tiles = analysis.offense.map(function (o) {
      const cls = o.best >= 2 ? 'se' : o.best >= 1 ? 'neutral' : 'resisted';
      const hitters = o.hitters.map(function (k) { return ctx.get(k); });
      return '<li class="off-tile ' + cls + '">' + C.typeBadge(o.type) +
        '<span class="off-mult">' + (o.best >= 2 ? 'Super efetivo' : o.best >= 1 ? 'Neutro' : o.best > 0 ? 'Resistido' : 'Sem efeito') + '</span>' +
        '<span class="off-hitters">' + hitters.slice(0, 4).map(function (p) { return C.sprite(p, 28); }).join('') + '</span></li>';
    }).join('');
    const cc = analysis.comboCoverage;
    return '<section class="panel"><div class="panel-head"><h2>Cobertura ofensiva</h2></div>' +
      '<p class="panel-sub">Melhor dano que os tipos do próprio time (STAB) causam em cada tipo. Contra as ' + cc.combos +
      ' combinações de tipos que existem em ' + esc(ctx.game.shortName) + ': <b>' + Math.round(cc.superEffective * 100) + '% super efetivo</b>, ' +
      Math.round(cc.neutral * 100) + '% neutro, ' + Math.round(cc.resisted * 100) + '% resistido.</p>' +
      '<div class="combo-bar" role="img" aria-label="Distribuição da cobertura"><i class="se" style="--w:' + (cc.superEffective * 100).toFixed(1) + '%"></i><i class="neutral" style="--w:' + (cc.neutral * 100).toFixed(1) + '%"></i><i class="resisted" style="--w:' + (cc.resisted * 100).toFixed(1) + '%"></i></div>' +
      '<ul class="off-grid">' + tiles + '</ul></section>';
  }

  /** Cartões de membros com função e stats base. */
  function membersBlock(analysis) {
    return '<section class="panel"><div class="panel-head"><h2>Funções e stats</h2></div>' +
      '<p class="panel-sub">Funções estimadas pelos stats base. A análise de habilidades, golpes e itens ainda não está nesta versão.</p>' +
      '<div class="member-grid">' + analysis.members.map(function (p) {
        return '<article class="member">' + '<div class="member-head">' + C.sprite(p, 48) + '<div><b>' + esc(p.name) + '</b><span>' + esc(p.roles.label) + '</span></div></div>' +
          C.statBars(p) + '</article>';
      }).join('') + '</div></section>';
  }

  /**
   * HTML completo da análise.
   * opts: { insights=true, members=true, beforeMembers: html inserido antes de "Funções e stats" }
   */
  function renderAnalysis(members, ctx, opts) {
    opts = opts || {};
    if (!members.length) {
      return '<section class="panel empty-state"><h2>Seu time está vazio</h2><p>Adicione Pokémon pela busca ou carregue um exemplo para ver a análise completa: fraquezas, resistências, cobertura ofensiva e o Team Score.</p></section>';
    }
    const analysis = E.analyzeTeam(members, ctx);
    const score = E.calculateFinalTeamScore(members, ctx, opts.weights);
    const insights = E.buildInsights(analysis, score, ctx);
    return scoreScreen(score, members, ctx) +
      (opts.insights === false ? '' : insightsBlock(insights)) +
      defenseTable(analysis, ctx) +
      offenseGrid(analysis, ctx) +
      (opts.beforeMembers || '') +
      (opts.members === false ? '' : membersBlock(analysis));
  }

  PTA.ui.analysisView = { renderAnalysis: renderAnalysis, defenseTable: defenseTable, scoreScreen: scoreScreen, rowStatus: rowStatus };
})(PTA);
