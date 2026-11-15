/**
 * scoringConfig — pesos e parâmetros do Team Score. AJUSTE AQUI.
 *
 * - `weights`: quantos pontos (de 100) cada componente vale. Se a soma não for 100,
 *   os pesos são normalizados automaticamente.
 * - `params`: constantes internas de cada componente (curvas, limites).
 *
 * Os pesos também podem ser alterados pela interface (aba "Pesos"), que salva
 * uma cópia no localStorage sem modificar este arquivo.
 */
(function (PTA) {
  'use strict';

  PTA.engine.scoringConfig = {
    weights: {
      offensive: 20,         // cobertura ofensiva (STAB) contra tipos e combinações do jogo
      defensive: 15,         // equilíbrio fraquezas × resistências por tipo
      sharedWeaknesses: 15,  // penaliza fraquezas empilhadas (3+ fracos) e duplas (4×)
      resistances: 10,       // todo tipo de ataque tem alguém que resiste?
      immunities: 8,         // quantidade de imunidades distintas
      threats: 12,           // respostas às ameaças mais fortes do jogo
      diversity: 8,          // variedade/redundância de tipos
      balance: 12,           // equilíbrio de funções (físico/especial, velocidade, bulk, poder)
    },

    params: {
      offensive: {
        valueSuper: 1, valueNeutral: 0.35, valueResisted: 0.1,
        singleTypeShare: 0.5,  // 50% tipos puros, 50% combinações reais do jogo
      },
      defensive: { base: 0.62, slope: 0.9, quadFactor: 0.5 },
      sharedWeaknesses: {
        stackFrom: 3,          // a partir de quantos fracos é "empilhamento"
        stackExponent: 1.5,
        noAnswerPenalty: 0.6,  // 2+ fracos e ninguém resiste
        quadPenalty: 0.35,     // por fraqueza dupla (4× / 2,5×)
        maxPenalty: 6,         // penalidade que zera o componente
      },
      resistances: { one: 0.65, two: 0.9, threeOrMore: 1 },
      immunities: { distinctTarget: 3, totalTarget: 5, distinctShare: 0.85 },
      threats: { wall: 1, counter: 0.9, revenge: 0.6, neutral: 0.35 },
      diversity: { perMemberUnique: 1.7, maxUnique: 10, tripleTypePenalty: 0.2, quadTypePenalty: 0.2, dupComboPenalty: 0.15 },
      balance: { mix: 0.3, speed: 0.2, bulk: 0.2, power: 0.3, fastTarget: 2 },
    },
  };
})(PTA);
