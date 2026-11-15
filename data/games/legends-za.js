/**
 * Pokémon Legends: Z-A — configuração do jogo.
 *
 * A PokéAPI ainda não possui learnsets de Z-A, então a disponibilidade vem das
 * Pokédex do jogo (Lumiose City + Hyperspace do DLC Mega Dimension).
 * Megas: entram se a espécie base estiver disponível e a Mega tiver sido
 * introduzida em um dos version groups listados em `megaVersionGroups`.
 */
PTA.registerGame({
  id: 'legends-za',
  name: 'Pokémon Legends: Z-A',
  shortName: 'Legends: Z-A',
  generation: 9,
  year: 2025,
  region: 'Kalos (Lumiose City)',
  theme: { accent: '#16c28a', accent2: '#0f5c74' },
  typeChart: 'gen6',
  effectiveness: 'standard',
  mechanics: { megaEvolution: true, terastallization: false, dynamax: false, zMoves: false },
  // Regra configurável: 1 Mega por time é o padrão competitivo e evita times "só de Megas".
  rules: { teamSize: 6, speciesClause: true, maxMegasPerTeam: 1 },
  data: {
    versionGroups: [],
    packs: [
      { id: 'base', label: 'Jogo base (Lumiose City)', pokedexes: ['lumiose-city'] },
      { id: 'mega-dimension', label: 'DLC Mega Dimension', pokedexes: ['hyperspace'], dlc: true },
    ],
    megaVersionGroups: ['x-y', 'omega-ruby-alpha-sapphire', 'legends-za', 'mega-dimension'],
    // Megas adicionadas pelo DLC (a PokéAPI marca todas as novas Megas no mesmo version group).
    megaPackOverrides: {
      'mega-dimension': [
        'raichu-mega-x', 'raichu-mega-y', 'chimecho-mega', 'absol-mega-z', 'staraptor-mega',
        'garchomp-mega-z', 'lucario-mega-z', 'heatran-mega', 'darkrai-mega', 'golurk-mega',
        'meowstic-male-mega', 'meowstic-female-mega', 'crabominable-mega', 'golisopod-mega',
        'magearna-mega', 'magearna-original-mega', 'zeraora-mega', 'scovillain-mega',
        'glimmora-mega', 'tatsugiri-curly-mega', 'tatsugiri-droopy-mega',
        'tatsugiri-stretchy-mega', 'baxcalibur-mega',
      ],
    },
    excludedForms: ['rayquaza-mega', 'diancie-mega'],
  },
  notes: [
    'Batalhas em tempo real: a efetividade de tipos segue a tabela padrão.',
    'Formas alternativas não-Mega seguem a forma padrão listada na Pokédex.',
  ],
});
