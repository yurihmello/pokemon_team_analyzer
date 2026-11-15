/**
 * Pokémon Scarlet / Violet — configuração do jogo.
 *
 * `data` descreve COMO a disponibilidade é calculada pelo tools/build-data.mjs:
 *  - versionGroups: Pokémon/formas com learnset nesse version group existem no jogo
 *    (inclui DLCs e transferências via HOME).
 *  - packs: agrupam os Pokémon por conteúdo (jogo base, DLC, HOME). O primeiro pack
 *    cuja Pokédex contém a espécie "ganha"; o pack `fallback` recebe o restante.
 */
PTA.registerGame({
  id: 'scarlet-violet',
  name: 'Pokémon Scarlet / Violet',
  shortName: 'Scarlet / Violet',
  generation: 9,
  year: 2022,
  region: 'Paldea',
  theme: { accent: '#e2483d', accent2: '#8b3fc7' },
  typeChart: 'gen6',
  effectiveness: 'standard',
  mechanics: { megaEvolution: false, terastallization: true, dynamax: false, zMoves: false },
  rules: { teamSize: 6, speciesClause: true, maxMegasPerTeam: 0 },
  data: {
    versionGroups: ['scarlet-violet'],
    packs: [
      { id: 'paldea', label: 'Jogo base (Paldea)', pokedexes: ['paldea'] },
      { id: 'kitakami', label: 'DLC The Teal Mask', pokedexes: ['kitakami'], dlc: true },
      { id: 'blueberry', label: 'DLC The Indigo Disk', pokedexes: ['blueberry'], dlc: true },
      { id: 'home', label: 'Transferência (HOME) / eventos', fallback: true, transfer: true },
    ],
    megaVersionGroups: [],
  },
  notes: [
    'A Terastalização pode mudar o tipo defensivo durante a batalha; a V1 analisa os tipos originais.',
  ],
});
