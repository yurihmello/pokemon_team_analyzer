#!/usr/bin/env node
/**
 * build-data.mjs — obtém, normaliza e armazena localmente os dados Pokémon.
 *
 * Fluxo:
 *   1. Baixa os CSVs oficiais da PokéAPI (github.com/PokeAPI/pokeapi) para .cache/
 *      (somente na primeira vez, ou com --refresh).
 *   2. Normaliza Pokémon, formas, tipos, stats e a tabela de efetividade.
 *   3. Lê as configs de jogo em data/games/*.js e calcula a disponibilidade de cada jogo.
 *   4. Grava arquivos .js em data/generated/ que o app carrega via <script>.
 *
 * Uso:
 *   node tools/build-data.mjs            # usa o cache se existir
 *   node tools/build-data.mjs --refresh  # força novo download
 *
 * O app NUNCA chama a API em tempo de execução: depois do build, tudo é local.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache');
const OUT = path.join(ROOT, 'data', 'generated');
const BASE_URL = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const ENGLISH = '9';

const CSV_FILES = [
  'pokemon', 'pokemon_species', 'pokemon_species_names', 'pokemon_forms', 'pokemon_form_names',
  'pokemon_types', 'pokemon_stats', 'pokemon_dex_numbers', 'pokedexes', 'version_groups',
  'types', 'type_efficacy', 'pokemon_moves',
];

// Formas que nunca entram na análise (cosméticas/temporárias que não mudam o time escolhido).
const EXCLUDED_SUFFIXES = ['-gmax', '-totem', '-eternamax', '-starter'];
const REGIONAL_TAGS = { alola: 'Alola', galar: 'Galar', hisui: 'Hisui', paldea: 'Paldea' };

// === UTILITÁRIOS ===

/**
 * Faz o parse de um CSV simples (com suporte a aspas).
 * Ex.: parseCsv('a,b\n1,"x,y"') → [{a:'1', b:'x,y'}]
 */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.filter((r) => r.length === header.length).map((r) => {
    const o = {};
    header.forEach((h, i) => { o[h] = r[i]; });
    return o;
  });
}

/** Baixa um CSV para o cache (se necessário) e devolve as linhas. */
async function loadCsv(name, refresh) {
  const file = path.join(CACHE, `${name}.csv`);
  if (refresh || !fs.existsSync(file)) {
    console.log(`[download] ${name}.csv`);
    const res = await fetch(`${BASE_URL}/${name}.csv`);
    if (!res.ok) throw new Error(`Falha ao baixar ${name}.csv: HTTP ${res.status}`);
    fs.writeFileSync(file, await res.text());
  }
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  console.log(`[csv] ${name}: ${rows.length} linhas`);
  return rows;
}

/** Agrupa linhas por uma chave. Ex.: groupBy(rows, 'pokemon_id') */
function groupBy(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = r[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

/** Converte 'charizard-mega-x' → 'Charizard Mega X' (fallback de nome). */
function prettify(identifier) {
  return identifier.split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
}

/** Escreve um arquivo .js que chama um registrador do namespace PTA. */
function writeJs(file, banner, code) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = `/* ${banner}\n * ARQUIVO GERADO por tools/build-data.mjs — não edite à mão. */\n${code};\n`;
  fs.writeFileSync(file, body);
  console.log(`[write] ${path.relative(ROOT, file)} (${(body.length / 1024).toFixed(1)} KB)`);
}

/** Carrega as configs de jogo (scripts de navegador) num sandbox para reutilizá-las. */
function loadGameConfigs() {
  const games = [];
  const sandbox = { PTA: { registerGame: (cfg) => games.push(cfg) } };
  vm.createContext(sandbox);
  const dir = path.join(ROOT, 'data', 'games');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), sandbox, { filename: f });
  }
  return games;
}

// === TRANSFORMAÇÕES ===

/** Monta a tabela de efetividade (somente valores ≠ 1). */
function buildTypeChart(types, efficacy) {
  const idToType = new Map(types.filter((t) => Number(t.id) <= 18).map((t) => [t.id, t.identifier]));
  const chart = {};
  for (const e of efficacy) {
    const atk = idToType.get(e.damage_type_id);
    const def = idToType.get(e.target_type_id);
    if (!atk || !def) continue;
    const factor = Number(e.damage_factor) / 100;
    if (factor === 1) continue;
    (chart[atk] = chart[atk] || {})[def] = factor;
  }
  return { id: 'gen6', label: 'Geração 6+ (com Fada)', attack: chart };
}

/** Normaliza todos os Pokémon (inclui formas, Megas e regionais). */
function buildPokemon(csv) {
  const vgById = new Map(csv.version_groups.map((v) => [v.id, v.identifier]));
  const typeById = new Map(csv.types.map((t) => [t.id, t.identifier]));
  const species = new Map(csv.pokemon_species.map((s) => [s.id, s]));
  const speciesName = new Map(csv.pokemon_species_names.filter((n) => n.local_language_id === ENGLISH)
    .map((n) => [n.pokemon_species_id, n.name]));
  const formsByPokemon = groupBy(csv.pokemon_forms, 'pokemon_id');
  const formNames = new Map(csv.pokemon_form_names.filter((n) => n.local_language_id === ENGLISH)
    .map((n) => [n.pokemon_form_id, n]));
  const typesByPokemon = groupBy(csv.pokemon_types, 'pokemon_id');
  const statsByPokemon = groupBy(csv.pokemon_stats, 'pokemon_id');

  const list = [];
  for (const p of csv.pokemon) {
    if (EXCLUDED_SUFFIXES.some((s) => p.identifier.endsWith(s) || p.identifier.includes(`${s}-`))) continue;
    const sp = species.get(p.species_id);
    if (!sp) continue;
    const forms = formsByPokemon.get(p.id) || [];
    const form = forms.find((f) => f.is_default === '1') || forms[0];
    if (!form) continue;
    const isMega = form.is_mega === '1';
    const isPrimal = p.identifier.endsWith('-primal');
    // Formas só-de-batalha (Zen Mode, Blade Forme...) não são escolhidas na montagem do time.
    if (form.is_battle_only === '1' && !isMega) continue;
    if (isPrimal) continue;

    const types = (typesByPokemon.get(p.id) || [])
      .sort((a, b) => Number(a.slot) - Number(b.slot))
      .map((t) => typeById.get(t.type_id));
    if (!types.length) continue;

    const st = {};
    for (const s of statsByPokemon.get(p.id) || []) st[s.stat_id] = Number(s.base_stat);
    const stats = [st[1], st[2], st[3], st[4], st[5], st[6]].map((v) => v || 0);

    const isDefault = p.is_default === '1';
    const baseName = speciesName.get(p.species_id) || prettify(sp.identifier);
    const fn = formNames.get(form.id);
    let name = baseName;
    if (!isDefault) name = (fn && fn.pokemon_name) || `${baseName} (${prettify(form.form_identifier || p.identifier)})`;

    const regionalKey = Object.keys(REGIONAL_TAGS).find((r) => p.identifier.includes(`-${r}`));
    list.push({
      key: p.identifier,
      id: Number(p.id),
      speciesId: Number(p.species_id),
      species: sp.identifier,
      name,
      form: isDefault ? null : (form.form_identifier || null),
      formName: isDefault ? null : ((fn && fn.form_name) || null),
      types,
      stats,
      bst: stats.reduce((a, b) => a + b, 0),
      isDefault,
      isMega,
      introducedIn: vgById.get(form.introduced_in_version_group_id) || null,
      regional: regionalKey ? REGIONAL_TAGS[regionalKey] : null,
      legendary: sp.is_legendary === '1',
      mythical: sp.is_mythical === '1',
      baby: sp.is_baby === '1',
      evolvesFrom: sp.evolves_from_species_id ? Number(sp.evolves_from_species_id) : null,
      generation: Number(sp.generation_id),
      nationalDex: Number(p.species_id),
    });
  }
  return list;
}

/**
 * Calcula a disponibilidade de um jogo a partir da sua config.
 * Retorna { packs, entries: [[key, packId]], regionalDex: {speciesId: n} }.
 */
function buildAvailability(game, pokemon, csv) {
  const d = game.data || {};
  const vgId = new Map(csv.version_groups.map((v) => [v.identifier, v.id]));
  const dexId = new Map(csv.pokedexes.map((x) => [x.identifier, x.id]));
  const dexBySpecies = groupBy(csv.pokemon_dex_numbers, 'species_id');
  const byKey = new Map(pokemon.map((p) => [p.key, p]));
  const defaultBySpecies = new Map(pokemon.filter((p) => p.isDefault).map((p) => [p.speciesId, p]));
  const excluded = new Set(d.excludedForms || []);

  // Pokédex → pack (o primeiro pack que lista a Pokédex vence)
  const packOfDex = new Map();
  const regionalDex = {};
  for (const pack of d.packs) {
    for (const dex of pack.pokedexes || []) {
      if (!dexId.has(dex)) throw new Error(`[${game.id}] Pokédex desconhecida: ${dex}`);
      if (!packOfDex.has(dexId.get(dex))) packOfDex.set(dexId.get(dex), pack.id);
    }
  }
  const fallbackPack = (d.packs.find((p) => p.fallback) || d.packs[0]).id;
  const packOrder = d.packs.map((p) => p.id);

  /** Pack de uma espécie (pela Pokédex regional) ou null. */
  function packOfSpecies(speciesId) {
    let best = null;
    for (const row of dexBySpecies.get(String(speciesId)) || []) {
      const pk = packOfDex.get(row.pokedex_id);
      if (!pk) continue;
      if (!regionalDex[speciesId]) regionalDex[speciesId] = Number(row.pokedex_number);
      if (best === null || packOrder.indexOf(pk) < packOrder.indexOf(best)) best = pk;
    }
    return best;
  }

  const chosen = new Map(); // key → packId
  if (d.versionGroups && d.versionGroups.length) {
    // Disponibilidade por learnset: o Pokémon/forma tem movimentos neste jogo.
    const vgs = new Set(d.versionGroups.map((v) => {
      if (!vgId.has(v)) throw new Error(`[${game.id}] version group desconhecido: ${v}`);
      return vgId.get(v);
    }));
    const ids = new Set();
    for (const m of csv.pokemon_moves) if (vgs.has(m.version_group_id)) ids.add(Number(m.pokemon_id));
    for (const p of pokemon) {
      if (!ids.has(p.id) || p.isMega || excluded.has(p.key)) continue;
      chosen.set(p.key, packOfSpecies(p.speciesId) || fallbackPack);
    }
  } else {
    // Disponibilidade por Pokédex: forma padrão de cada espécie listada.
    for (const [speciesId, p] of defaultBySpecies) {
      if (excluded.has(p.key)) continue;
      const pk = packOfSpecies(speciesId);
      if (pk) chosen.set(p.key, pk);
    }
    for (const extra of d.extraForms || []) {
      const p = byKey.get(extra.key);
      if (p) chosen.set(p.key, extra.pack || fallbackPack);
    }
  }

  // Megas por regra: jogo com Mega Evolução + espécie base disponível + version group permitido.
  if (game.mechanics && game.mechanics.megaEvolution) {
    const allowed = new Set(d.megaVersionGroups || []);
    const overrides = new Map();
    for (const [pk, keys] of Object.entries(d.megaPackOverrides || {})) keys.forEach((k) => overrides.set(k, pk));
    const basePack = new Map();
    for (const [key, pk] of chosen) basePack.set(byKey.get(key).speciesId, pk);
    for (const p of pokemon) {
      if (!p.isMega || excluded.has(p.key) || !allowed.has(p.introducedIn)) continue;
      if (!basePack.has(p.speciesId)) continue;
      const pk = overrides.get(p.key) || basePack.get(p.speciesId);
      // Se a Mega é de um DLC, ela fica no pack mais "tardio" entre ela e a espécie base.
      const later = packOrder.indexOf(pk) >= packOrder.indexOf(basePack.get(p.speciesId)) ? pk : basePack.get(p.speciesId);
      chosen.set(p.key, later);
    }
  }

  // Deduplicação: formas da mesma espécie com mesmos tipos e stats (ex.: Pikachu com bonés).
  const seen = new Set();
  const entries = [];
  const sorted = [...chosen.keys()].map((k) => byKey.get(k))
    .sort((a, b) => (b.isDefault - a.isDefault) || (a.id - b.id));
  for (const p of sorted) {
    const sig = `${p.speciesId}|${p.isMega}|${[...p.types].sort().join('/')}|${p.stats.join(',')}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    entries.push([p.key, chosen.get(p.key)]);
  }
  entries.sort((a, b) => byKey.get(a[0]).id - byKey.get(b[0]).id);

  return {
    gameId: game.id,
    packs: d.packs.map(({ id, label, dlc, transfer, fallback }) => ({ id, label, dlc: !!dlc, transfer: !!transfer, fallback: !!fallback })),
    entries,
    regionalDex,
  };
}

// === EXECUÇÃO ===

async function main() {
  const refresh = process.argv.includes('--refresh');
  fs.mkdirSync(CACHE, { recursive: true });
  const csv = {};
  for (const name of CSV_FILES) csv[name] = await loadCsv(name, refresh);

  const typeChart = buildTypeChart(csv.types, csv.type_efficacy);
  writeJs(path.join(OUT, 'type-charts.js'), 'Tabela de efetividade (Gen 6+) — fonte: PokéAPI',
    `PTA.registerTypeChart('gen6', ${JSON.stringify(typeChart)})`);

  const pokemon = buildPokemon(csv);
  console.log(`[pokemon] ${pokemon.length} Pokémon/formas normalizados`);

  const games = loadGameConfigs();
  const usedKeys = new Set();
  for (const game of games) {
    const av = buildAvailability(game, pokemon, csv);
    av.entries.forEach(([k]) => usedKeys.add(k));
    const counts = {};
    av.entries.forEach(([, pk]) => { counts[pk] = (counts[pk] || 0) + 1; });
    console.log(`[game] ${game.id}: ${av.entries.length} Pokémon/formas`, counts);
    writeJs(path.join(OUT, 'availability', `${game.id}.js`), `Disponibilidade — ${game.name}`,
      `PTA.registerAvailability('${game.id}', ${JSON.stringify(av)})`);
  }

  const db = {
    source: 'PokéAPI (github.com/PokeAPI/pokeapi, data/v2/csv)',
    generatedAt: new Date().toISOString(),
    statOrder: ['hp', 'atk', 'def', 'spa', 'spd', 'spe'],
    pokemon: pokemon.filter((p) => usedKeys.has(p.key)),
  };
  writeJs(path.join(OUT, 'pokemon-db.js'), `Banco de Pokémon normalizado — ${db.pokemon.length} entradas`,
    `PTA.registerPokemonDB(${JSON.stringify(db)})`);
  console.log('[ok] build concluído');
}

main().catch((err) => { console.error(err); process.exit(1); });
