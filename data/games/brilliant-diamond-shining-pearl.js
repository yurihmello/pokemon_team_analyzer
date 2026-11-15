/** Pokémon Brilliant Diamond / Shining Pearl — configuração do jogo. */
PTA.registerGame({
  id: 'brilliant-diamond-shining-pearl',
  name: 'Pokémon Brilliant Diamond / Shining Pearl',
  shortName: 'BD / SP',
  generation: 8,
  year: 2021,
  region: 'Sinnoh',
  theme: { accent: '#4b7be5', accent2: '#e07bb5' },
  typeChart: 'gen6',
  effectiveness: 'standard',
  mechanics: { megaEvolution: false, terastallization: false, dynamax: false, zMoves: false },
  rules: { teamSize: 6, speciesClause: true, maxMegasPerTeam: 0 },
  data: {
    versionGroups: ['brilliant-diamond-shining-pearl'],
    packs: [
      { id: 'sinnoh', label: 'Pokédex de Sinnoh', pokedexes: ['original-sinnoh'] },
      { id: 'national', label: 'Pós-jogo (Grand Underground, Ramanas Park, HOME)', fallback: true },
    ],
    megaVersionGroups: [],
  },
  notes: [],
});
