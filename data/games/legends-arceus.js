/**
 * Pokémon Legends: Arceus — configuração do jogo.
 * Mecânica própria de efetividade: super efetivo contra os dois tipos = 2,5×
 * (em vez de 4×) e pouco efetivo contra os dois = 0,4× (em vez de 0,25×).
 */
PTA.registerGame({
  id: 'legends-arceus',
  name: 'Pokémon Legends: Arceus',
  shortName: 'Legends: Arceus',
  generation: 8,
  year: 2022,
  region: 'Hisui',
  theme: { accent: '#c9a227', accent2: '#3c5a7a' },
  typeChart: 'gen6',
  effectiveness: 'legends-arceus',
  mechanics: { megaEvolution: false, terastallization: false, dynamax: false, zMoves: false },
  rules: { teamSize: 6, speciesClause: true, maxMegasPerTeam: 0 },
  data: {
    versionGroups: ['legends-arceus'],
    packs: [
      { id: 'hisui', label: 'Pokédex de Hisui', pokedexes: ['hisui'], fallback: true },
    ],
    megaVersionGroups: [],
  },
  notes: ['Dano duplo super efetivo é 2,5× e duplo pouco efetivo é 0,4× neste jogo.'],
});
