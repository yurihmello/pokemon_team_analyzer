/**
 * insights — traduz números em explicações legíveis.
 *
 * buildInsights(analysis, score, ctx) → lista de { level, icon, title, text, type? }
 *   level: 'danger' | 'warning' | 'info' | 'good'
 *
 * summarizeTeam(...) → { strengths: [string], weaknesses: [string] } (cards de times gerados).
 *
 * As regras ficam em uma lista simples para facilitar ajustes e novas regras.
 */
(function (PTA) {
  'use strict';

  function tn(t) { return PTA.data.types.meta[t].name; }
  function plural(n, s, p) { return n + ' ' + (n === 1 ? s : p); }
  function names(ctx, keys) { return keys.map(function (k) { const p = ctx.get(k); return p ? p.name : k; }); }
  function joinList(list) {
    if (list.length <= 1) return list.join('');
    return list.slice(0, -1).join(', ') + ' e ' + list[list.length - 1];
  }

  const LEVEL_ORDER = { danger: 0, warning: 1, info: 2, good: 3 };

  /** Insights defensivos por tipo. */
  function defenseInsights(a, ctx, out) {
    const n = a.stats.size;
    a.defense.forEach(function (d) {
      const t = tn(d.type);
      const weakNames = d.members.filter(function (m) { return m.mult > 1; }).map(function (m) { return ctx.get(m.key).name; });
      if (d.weak >= 3 && d.answers <= 1) {
        out.push({ level: 'danger', icon: '⚠️', type: d.type, title: 'Vulnerabilidade significativa contra ' + t,
          text: plural(d.weak, 'Pokémon é fraco', 'Pokémon são fracos') + ' contra ' + t + ' (' + joinList(weakNames) + ') e ' + (d.answers ? 'apenas 1 possui resistência/imunidade.' : 'nenhum possui resistência ou imunidade.') });
      } else if (d.weak >= 2 && d.answers === 0) {
        out.push({ level: 'warning', icon: '⚠️', type: d.type, title: 'Concentração de fraquezas contra ' + t,
          text: d.weak + ' Pokémon são fracos contra ' + t + ' (' + joinList(weakNames) + ') e ninguém no time resiste.' });
      } else if (d.weak >= 3) {
        out.push({ level: 'warning', icon: '⚠️', type: d.type, title: 'Muitas fraquezas contra ' + t,
          text: d.weak + ' Pokémon são fracos contra ' + t + ', mas ' + plural(d.answers, 'membro resiste', 'membros resistem') + ' e pode' + (d.answers > 1 ? 'm' : '') + ' absorver esses golpes.' });
      } else if (n >= 3 && d.weak === 0 && d.answers >= 3) {
        out.push({ level: 'good', icon: '✅', type: d.type, title: 'Excelente cobertura defensiva contra ' + t,
          text: 'Nenhum Pokémon é fraco e ' + d.answers + ' resistem' + (d.immune ? ' (' + d.immune + ' imune' + (d.immune > 1 ? 's' : '') + ')' : '') + '.' });
      }
      if (d.immune >= 2) {
        out.push({ level: 'good', icon: '🛡️', type: d.type, title: d.immune + ' imunidades a ' + t,
          text: d.immune + ' Pokémon não recebem dano de ' + t + (d.resist ? ' e outros ' + d.resist + ' resistem' : '') + '.' });
      }
    });
    const dw = ctx.calc.doubleWeakThreshold;
    a.members.forEach(function (p) {
      const quads = [];
      for (let i = 0; i < ctx.types.length; i++) if (p.profile[i] >= dw) quads.push(tn(ctx.types[i]));
      if (quads.length) {
        out.push({ level: 'warning', icon: '💥', title: p.name + ' tem fraqueza dupla',
          text: p.name + ' recebe ' + PTA.engine.formatMultiplier(dw) + ' de dano de ' + joinList(quads) + '.' });
      }
    });
  }

  /** Insights ofensivos (STAB). */
  function offenseInsights(a, ctx, out) {
    if (!a.stats.size) return;
    const se = a.offense.filter(function (o) { return o.best >= 2; });
    const noSe = a.offense.filter(function (o) { return o.best < 2; });
    const resisted = a.offense.filter(function (o) { return o.best < 1; });
    if (se.length >= 15) {
      out.push({ level: 'good', icon: '🎯', title: 'Ótima cobertura ofensiva',
        text: 'Os tipos do time acertam ' + se.length + ' de 18 tipos com dano super efetivo (STAB).' });
    }
    if (resisted.length) {
      out.push({ level: 'warning', icon: '🧱', title: 'Tipos que resistem a todo o seu STAB',
        text: 'Nenhum tipo do time causa ao menos dano neutro em ' + joinList(resisted.map(function (o) { return tn(o.type); })) + '. Considere golpes de cobertura.' });
    }
    if (noSe.length && noSe.length <= 8) {
      out.push({ level: 'info', icon: '🎯', title: 'Sem vantagem ofensiva contra ' + plural(noSe.length, 'tipo', 'tipos'),
        text: 'Nenhum STAB do time é super efetivo contra ' + joinList(noSe.map(function (o) { return tn(o.type); })) + '.' });
    }
    const cc = a.comboCoverage;
    out.push({ level: cc.superEffective >= 0.75 ? 'good' : 'info', icon: '📊', title: 'Cobertura contra os Pokémon do jogo',
      text: 'Considerando as ' + cc.combos + ' combinações de tipo que existem neste jogo, o STAB do time é super efetivo contra ' + Math.round(cc.superEffective * 100) + '% delas e resistido por ' + Math.round(cc.resisted * 100) + '%.' });
  }

  /** Insights de ameaças, funções e diversidade (lidos dos detalhes do score). */
  function scoreInsights(score, ctx, out) {
    const byId = {};
    score.components.forEach(function (c) { byId[c.id] = c; });
    const th = byId.threats && byId.threats.details;
    if (th && th.total) {
      if (th.unanswered.length) {
        const top = th.unanswered.slice(0, 5).map(function (u) { return u.name; });
        out.push({ level: th.unanswered.length >= 8 ? 'danger' : 'warning', icon: '👹', title: 'Ameaças sem resposta clara',
          text: 'Entre os ' + th.total + ' Pokémon mais fortes do jogo, ' + th.unanswered.length + ' não têm um bom "counter" no seu time, como ' + joinList(top) + '.' });
      } else {
        out.push({ level: 'good', icon: '👹', title: 'Respostas para as ameaças comuns', text: 'Todas as ' + th.total + ' ameaças mais fortes do jogo têm ao menos uma resposta razoável no time.' });
      }
    }
    const bal = byId.balance && byId.balance.details;
    if (bal && ctx && byId.balance) {
      const r = bal.roles;
      if (r.physical + r.mixed === 0) out.push({ level: 'info', icon: '⚖️', title: 'Sem atacante físico', text: 'Nenhum membro tem Ataque base alto. Times só especiais são parados por muralhas especiais.' });
      if (r.special + r.mixed === 0) out.push({ level: 'info', icon: '⚖️', title: 'Sem atacante especial', text: 'Nenhum membro tem Ataque Especial base alto. Muralhas físicas podem segurar o time.' });
      if (r.fast === 0) out.push({ level: 'warning', icon: '🐢', title: 'Time lento', text: 'Nenhum membro tem Velocidade base ≥ 95: o time tende a apanhar primeiro.' });
      if (r.physBulk + r.specBulk === 0) out.push({ level: 'info', icon: '🪨', title: 'Pouca resistência física/especial', text: 'Nenhum membro tem bulk alto (HP + Defesa ou HP + Def. Especial).' });
    }
    const div = byId.diversity && byId.diversity.details;
    if (div) {
      div.repeated.filter(function (x) { return x.count >= 3; }).forEach(function (x) {
        out.push({ level: 'warning', icon: '🔁', type: x.type, title: 'Tipo ' + tn(x.type) + ' repetido', text: x.count + ' Pokémon compartilham o tipo ' + tn(x.type) + ', o que tende a empilhar as mesmas fraquezas.' });
      });
    }
  }

  /** Lista completa de insights, ordenada por gravidade. */
  function buildInsights(analysis, score, ctx) {
    const out = [];
    analysis.validation.forEach(function (msg) { out.push({ level: 'danger', icon: '⛔', title: 'Regra do jogo', text: msg }); });
    if (analysis.stats.size && analysis.stats.size < 6) {
      out.push({ level: 'info', icon: '🧩', title: 'Time incompleto (' + analysis.stats.size + '/6)', text: 'O score considera só os membros atuais. Veja abaixo quem adicionar.' });
    }
    defenseInsights(analysis, ctx, out);
    offenseInsights(analysis, ctx, out);
    scoreInsights(score, ctx, out);
    return out.sort(function (a, b) { return LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]; });
  }

  /** Resumo curto (pontos fortes / fracos) para os cards de times gerados. */
  function summarizeTeam(analysis, score, ctx) {
    const strengths = [], weaknesses = [];
    const d = analysis.defense;
    const imm = d.filter(function (x) { return x.immune > 0; });
    if (imm.length >= 3) strengths.push(imm.length + ' imunidades relevantes (' + imm.map(function (x) { return tn(x.type); }).join(', ') + ')');
    d.filter(function (x) { return x.weak === 0 && x.answers >= 3; })
      .sort(function (a, b) { return ctx.typeWeight[ctx.calc.index[b.type]] - ctx.typeWeight[ctx.calc.index[a.type]]; })
      .slice(0, 2).forEach(function (x) { strengths.push('Excelente defesa contra ' + tn(x.type)); });
    const stacked = d.filter(function (x) { return x.weak >= 3; });
    if (!stacked.length) strengths.push('Poucas fraquezas compartilhadas');
    const se = analysis.offense.filter(function (o) { return o.best >= 2; }).length;
    if (se >= 14) strengths.push('STAB super efetivo contra ' + se + '/18 tipos');
    const thr = score.components.filter(function (c) { return c.id === 'threats'; })[0];
    if (thr && thr.details && thr.details.unanswered.length === 0) strengths.push('Responde a todas as ameaças comuns');

    d.filter(function (x) { return x.weak >= 2 && x.weak > x.answers; })
      .sort(function (a, b) { return (b.weak - b.answers) - (a.weak - a.answers); })
      .slice(0, 2).forEach(function (x) {
        weaknesses.push((x.weak >= 3 ? 'Vulnerabilidade a ' : 'Vulnerabilidade moderada a ') + tn(x.type) + ' (' + x.weak + ' fracos, ' + x.answers + ' resist.)');
      });
    const noSe = analysis.offense.filter(function (o) { return o.best < 2; }).map(function (o) { return tn(o.type); });
    if (noSe.length) weaknesses.push('Sem STAB super efetivo contra ' + noSe.slice(0, 3).join(', ') + (noSe.length > 3 ? '…' : ''));
    if (thr && thr.details && thr.details.unanswered.length) weaknesses.push('Ameaça sem resposta: ' + thr.details.unanswered.slice(0, 2).map(function (u) { return u.name; }).join(', '));
    if (!analysis.stats.roles.fast) weaknesses.push('Nenhum Pokémon rápido');
    return { strengths: strengths.slice(0, 4), weaknesses: weaknesses.slice(0, 3) };
  }

  PTA.engine.buildInsights = buildInsights;
  PTA.engine.summarizeTeam = summarizeTeam;
  PTA.engine.insightHelpers = { typeName: tn, joinList: joinList, names: names };
})(PTA);
