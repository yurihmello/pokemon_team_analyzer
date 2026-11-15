/** Pokémon X / Y — configuração do jogo (Megas introduzidas em X/Y). */
PTA.registerGame({
  id: 'x-y',
  name: 'Pokémon X / Y',
  shortName: 'X / Y',
  generation: 6,
  year: 2013,
  region: 'Kalos',
  theme: { accent: '#1f6fd1', accent2: '#d1312a' },
  typeChart: 'gen6',
  effectiveness: 'standard',
  mechanics: { megaEvolution: true, terastallization: false, dynamax: false, zMoves: false },
  rules: { teamSize: 6, speciesClause: true, maxMegasPerTeam: 1 },
  data: {
    versionGroups: ['x-y'],
    packs: [
      { id: 'kalos', label: 'Pokédex de Kalos', pokedexes: ['kalos-central', 'kalos-coastal', 'kalos-mountain'] },
      { id: 'transfer', label: 'Transferência (Poké Bank) / trocas / eventos', fallback: true, transfer: true },
    ],
    megaVersionGroups: ['x-y'],
    excludedForms: [],
  },
  notes: ['Somente 1 Mega Evolução por batalha.'],
});
