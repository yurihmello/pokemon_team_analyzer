#!/usr/bin/env node
/**
 * download-sprites.mjs — baixa os sprites (96×96) de todos os Pokémon do banco
 * para assets/sprites/ e grava o manifesto data/generated/sprites.js.
 *
 * Opcional: sem os sprites locais o app usa a URL remota da PokéAPI e, se
 * estiver offline, mostra um marcador com as cores dos tipos.
 *
 * Uso: node tools/download-sprites.mjs  (rode depois de build-data.mjs)
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets', 'sprites');
const SPRITE_URL = (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
const CONCURRENCY = 16;

/** Lê o banco gerado (script de navegador) num sandbox. */
function loadDb() {
  let db = null;
  const sandbox = { PTA: { registerPokemonDB: (x) => { db = x; } } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'data', 'generated', 'pokemon-db.js'), 'utf8'), sandbox);
  return db;
}

/** Baixa um sprite; devolve true se o arquivo existe ao final. */
async function download(id) {
  const file = path.join(OUT_DIR, `${id}.png`);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return true;
  try {
    const res = await fetch(SPRITE_URL(id));
    if (!res.ok) return false;
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const ids = [...new Set(loadDb().pokemon.map((p) => p.id))];
  const ok = [];
  let i = 0;
  async function worker() {
    while (i < ids.length) {
      const id = ids[i++];
      if (await download(id)) ok.push(id);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  ok.sort((a, b) => a - b);
  console.log(`[sprites] ${ok.length}/${ids.length} disponíveis localmente`);
  const code = `/* Manifesto de sprites locais — ARQUIVO GERADO por tools/download-sprites.mjs */\nPTA.registerSprites(${JSON.stringify({ path: 'assets/sprites/', local: ok })});\n`;
  fs.writeFileSync(path.join(ROOT, 'data', 'generated', 'sprites.js'), code);
}

main().catch((e) => { console.error(e); process.exit(1); });
