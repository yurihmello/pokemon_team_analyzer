/** Pokémon Sword / Shield — configuração do jogo. Ver scarlet-violet.js para o formato. */
PTA.registerGame({
  id: 'sword-shield',
  name: 'Pokémon Sword / Shield',
  shortName: 'Sword / Shield',
  generation: 8,
  year: 2019,
  region: 'Galar',
  theme: { accent: '#00a1e9', accent2: '#e4007f' },
  typeChart: 'gen6',
  effectiveness: 'standard',
  mechanics: { megaEvolution: false, terastallization: false, dynamax: true, zMoves: false },
  rules: { teamSize: 6, speciesClause: true, maxMegasPerTeam: 0 },
  data: {
    versionGroups: ['sword-shield'],
    packs: [
      { id: 'galar', label: 'Jogo base (Galar)', pokedexes: ['galar'] },
      { id: 'isle-of-armor', label: 'DLC The Isle of Armor', pokedexes: ['isle-of-armor'], dlc: true },
      { id: 'crown-tundra', label: 'DLC The Crown Tundra', pokedexes: ['crown-tundra'], dlc: true },
      { id: 'home', label: 'Transferência (HOME) / eventos', fallback: true, transfer: true },
    ],
    megaVersionGroups: [],
  },
  notes: ['Dynamax/Gigantamax não altera tipos e não é considerado na V1.'],
});
