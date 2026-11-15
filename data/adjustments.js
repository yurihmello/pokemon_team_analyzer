/**
 * Ajustes manuais de "poder efetivo" para Pokémon cujos stats base enganam.
 *
 * A V1 ainda não analisa habilidades; estes poucos casos teriam um BST
 * enganosamente alto (ex.: Slaking com Truant) e dominariam as sugestões.
 * O fator reduz o BSR (poder) usado no equilíbrio de funções, nas ameaças e no gerador:
 * poder = BSR − (1 − fator) × 450.
 * Quando a análise de habilidades existir, esta lista pode ser substituída por ela.
 */
PTA.data.adjustments = {
  powerFactor: {
    slaking: 0.6,      // Truant: age em turnos alternados
    regigigas: 0.65,   // Slow Start: Ataque e Velocidade pela metade nos 5 primeiros turnos
    archeops: 0.9,     // Defeatist: stats caem pela metade abaixo de 50% de HP
    shedinja: 0.9,     // Wonder Guard não é modelado (HP fixo em 1)
  },
};
