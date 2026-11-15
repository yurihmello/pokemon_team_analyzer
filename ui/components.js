/**
 * components — peças visuais reutilizáveis (retornam strings HTML).
 */
(function (PTA) {
  'use strict';

  const esc = PTA.ui.dom.esc;
  const REMOTE_SPRITE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';

  function typeMeta(t) { return PTA.data.types.meta[t]; }

  /** Selo de tipo colorido. Ex.: typeBadge('fire') */
  function typeBadge(t, opts) {
    opts = opts || {};
    const m = typeMeta(t);
    return '<span class="type' + (opts.small ? ' sm' : '') + '" style="--tc:' + m.color + ';--tt:' + m.text + '" title="' + esc(m.name + ' (' + m.namePt + ')') + '">' + esc(opts.short ? m.name.slice(0, 3) : m.name) + '</span>';
  }

  function typeBadges(types, opts) { return types.map(function (t) { return typeBadge(t, opts); }).join(''); }

  /** URL do sprite: local (se baixado) → remoto (PokéAPI). */
  function spriteUrl(p) {
    const s = PTA.data.sprites;
    if (s && s.inline && s.inline[p.id]) return s.inline[p.id];
    if (s && s.localSet && s.localSet.has(p.id)) return s.path + p.id + '.png';
    return REMOTE_SPRITE + p.id + '.png';
  }

  /** Imagem do Pokémon com fallback para um disco nas cores dos tipos. */
  function sprite(p, size) {
    size = size || 64;
    const c1 = typeMeta(p.types[0]).color, c2 = typeMeta(p.types[1] || p.types[0]).color;
    return '<span class="sprite" style="--s:' + size + 'px;--c1:' + c1 + ';--c2:' + c2 + '">' +
      '<img src="' + esc(spriteUrl(p)) + '" alt="" width="' + size + '" height="' + size + '" loading="lazy" decoding="async" onerror="this.parentNode.classList.add(\'missing\');this.remove()">' +
      '<span class="sprite-fallback" aria-hidden="true">' + esc(p.name.replace(/^(Mega|Alolan|Galarian|Hisuian|Paldean) /, '').charAt(0)) + '</span></span>';
  }

  /** Etiquetas de forma (Mega, regional) e de conteúdo (DLC/transferência). */
  function formTags(p, ctx) {
    let html = '';
    if (p.isMega) html += '<span class="tag mega">Mega</span>';
    if (p.regional) html += '<span class="tag regional">' + esc(p.regional) + '</span>';
    if (p.legendary) html += '<span class="tag legend">Lendário</span>';
    if (p.mythical) html += '<span class="tag legend">Mítico</span>';
    if (ctx && p.pack) {
      const pack = ctx.packs.filter(function (x) { return x.id === p.pack; })[0];
      if (pack && (pack.dlc || pack.transfer)) html += '<span class="tag pack" title="' + esc(pack.label) + '">' + (pack.dlc ? 'DLC' : 'Transferência') + '</span>';
    }
    return html;
  }

  /** Nota em letra. Ex.: grade(92) → { letter:'S', label:'Excepcional' } */
  function grade(score) {
    if (score >= 90) return { letter: 'S', label: 'Excepcional', cls: 's' };
    if (score >= 80) return { letter: 'A', label: 'Muito bom', cls: 'a' };
    if (score >= 70) return { letter: 'B', label: 'Bom', cls: 'b' };
    if (score >= 60) return { letter: 'C', label: 'Regular', cls: 'c' };
    return { letter: 'D', label: 'Precisa de ajustes', cls: 'd' };
  }

  /** Anel de score em SVG. */
  function scoreRing(score, size) {
    size = size || 132;
    const r = 52, c = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(100, score)) / 100;
    const g = grade(score);
    return '<div class="ring g-' + g.cls + '" style="--size:' + size + 'px" role="img" aria-label="Team Score ' + Math.round(score) + ' de 100">' +
      '<svg viewBox="0 0 120 120"><circle class="ring-track" cx="60" cy="60" r="' + r + '"/>' +
      '<circle class="ring-value" cx="60" cy="60" r="' + r + '" stroke-dasharray="' + (c * pct).toFixed(1) + ' ' + c.toFixed(1) + '"/></svg>' +
      '<div class="ring-label"><strong>' + Math.round(score) + '</strong><span>/100</span></div></div>';
  }

  /** Célula de multiplicador para a tabela de fraquezas. */
  function multCell(mult) {
    const cls = mult === 0 ? 'm-immune' : mult >= 2.5 ? 'm-x4' : mult > 1 ? 'm-x2' : mult <= 0.4 ? 'm-x025' : mult < 1 ? 'm-x05' : 'm-x1';
    const label = mult === 1 ? '' : PTA.engine.formatMultiplier(mult);
    return '<td class="mult ' + cls + '" title="' + esc(PTA.engine.formatMultiplier(mult)) + '">' + label + '</td>';
  }

  /**
   * Bolinhas de um tipo: verde = resiste/imune, vermelho = fraco, branco = neutro.
   * Ex.: dots({weak:2, resist:1, immune:1, neutral:2})
   */
  function dots(row) {
    let html = '<span class="dots" aria-label="' + row.weak + ' fracos, ' + (row.resist + row.immune) + ' resistem, ' + row.neutral + ' neutros">';
    for (let i = 0; i < row.immune; i++) html += '<i class="dot immune" title="Imune"></i>';
    for (let i = 0; i < row.resist; i++) html += '<i class="dot resist" title="Resiste"></i>';
    for (let i = 0; i < row.weak; i++) html += '<i class="dot weak" title="Fraco"></i>';
    for (let i = 0; i < row.neutral; i++) html += '<i class="dot neutral" title="Neutro"></i>';
    return html + '</span>';
  }

  /** Selo de variação. Ex.: delta(+6.2) → '+6' */
  function delta(d) {
    const v = Math.round(d);
    const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
    return '<span class="delta ' + cls + '">' + (v > 0 ? '+' : '') + v + '</span>';
  }

  /** Mini card de Pokémon (sprite + nome + tipos). */
  function monChip(p, opts) {
    opts = opts || {};
    return '<span class="mon-chip' + (opts.highlight ? ' hl-' + opts.highlight : '') + '">' + sprite(p, opts.size || 40) +
      '<span class="mon-chip-text"><b>' + esc(p.name) + '</b><span>' + typeBadges(p.types, { small: true }) + '</span></span></span>';
  }

  /** Card de Pokémon (Pokédex e resultados de busca). */
  function pokemonCard(p, ctx, opts) {
    opts = opts || {};
    return '<article class="mon-card" data-key="' + esc(p.key) + '">' +
      '<div class="mon-card-top">' + sprite(p, 72) +
      '<span class="dexno">#' + String(p.dexNo || p.nationalDex).padStart(3, '0') + '</span></div>' +
      '<h3>' + esc(p.name) + '</h3>' +
      '<div class="types">' + typeBadges(p.types, { small: true }) + '</div>' +
      '<div class="mon-meta"><span title="Base Stat Rating (Smogon), relativo a este jogo. Média 200. BST ' + p.bst + '">BSR ' + p.bsr + '</span><span>' + esc(p.roles.label) + '</span></div>' +
      '<div class="tags">' + formTags(p, ctx) + (p.isFinal ? '' : '<span class="tag evo">Evolui</span>') + '</div>' +
      (opts.action ? '<button class="btn sm" data-action="' + esc(opts.action) + '" data-key="' + esc(p.key) + '"' + (opts.disabled ? ' disabled' : '') + '>' + esc(opts.actionLabel || 'Adicionar') + '</button>' : '') +
      '</article>';
  }

  /** Barras de stats base. */
  function statBars(p) {
    const r = p.rating;
    const ratings = r ? '<div class="bsr-row" title="Base Stat Rating (Smogon CAP). Média do jogo: 200; PS/SS/PT/ST: média 100.">' +
      '<b>BSR ' + r.bsr + '</b><span>PS ' + r.ps + '</span><span>SS ' + r.ss + '</span><span>PT ' + r.pt + '</span><span>ST ' + r.st + '</span></div>' : '';
    const labels = ['HP', 'Atq', 'Def', 'AtE', 'DeE', 'Vel'];
    return ratings + '<div class="statbars">' + p.stats.map(function (v, i) {
      return '<div class="statbar"><span>' + labels[i] + '</span><i style="--w:' + Math.min(100, (v / 180) * 100).toFixed(0) + '%"></i><b>' + v + '</b></div>';
    }).join('') + '</div>';
  }

  PTA.ui.c = {
    typeBadge: typeBadge, typeBadges: typeBadges, sprite: sprite, spriteUrl: spriteUrl, formTags: formTags,
    grade: grade, scoreRing: scoreRing, multCell: multCell, dots: dots, delta: delta, monChip: monChip,
    pokemonCard: pokemonCard, statBars: statBars, typeMeta: typeMeta,
  };
})(PTA);
