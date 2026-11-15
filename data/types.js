/**
 * Metadados dos tipos (nome, nome em português, cor).
 * A tabela de efetividade em si fica em data/generated/type-charts.js
 * (gerada a partir da PokéAPI), e cada jogo escolhe qual tabela usa.
 */
PTA.registerTypes({
  order: [
    'normal', 'fire', 'water', 'electric', 'grass', 'ice',
    'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug',
    'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
  ],
  meta: {
    normal:   { name: 'Normal',   namePt: 'Normal',   color: '#9fa19f', text: '#fff' },
    fire:     { name: 'Fire',     namePt: 'Fogo',     color: '#e62829', text: '#fff' },
    water:    { name: 'Water',    namePt: 'Água',     color: '#2980ef', text: '#fff' },
    electric: { name: 'Electric', namePt: 'Elétrico', color: '#fac000', text: '#222' },
    grass:    { name: 'Grass',    namePt: 'Planta',   color: '#3fa129', text: '#fff' },
    ice:      { name: 'Ice',      namePt: 'Gelo',     color: '#3dcef3', text: '#123' },
    fighting: { name: 'Fighting', namePt: 'Lutador',  color: '#ff8000', text: '#fff' },
    poison:   { name: 'Poison',   namePt: 'Venenoso', color: '#9141cb', text: '#fff' },
    ground:   { name: 'Ground',   namePt: 'Terrestre',color: '#915121', text: '#fff' },
    flying:   { name: 'Flying',   namePt: 'Voador',   color: '#81b9ef', text: '#123' },
    psychic:  { name: 'Psychic',  namePt: 'Psíquico', color: '#ef4179', text: '#fff' },
    bug:      { name: 'Bug',      namePt: 'Inseto',   color: '#91a119', text: '#fff' },
    rock:     { name: 'Rock',     namePt: 'Pedra',    color: '#afa981', text: '#222' },
    ghost:    { name: 'Ghost',    namePt: 'Fantasma', color: '#704170', text: '#fff' },
    dragon:   { name: 'Dragon',   namePt: 'Dragão',   color: '#5060e1', text: '#fff' },
    dark:     { name: 'Dark',     namePt: 'Sombrio',  color: '#624d4e', text: '#fff' },
    steel:    { name: 'Steel',    namePt: 'Aço',      color: '#60a1b8', text: '#fff' },
    fairy:    { name: 'Fairy',    namePt: 'Fada',     color: '#ef70ef', text: '#fff' },
  },
});
