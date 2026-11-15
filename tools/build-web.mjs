#!/usr/bin/env node
/**
 * build-web.mjs — prepara a versão publicável do app.
 *
 *  1. Gera sw-manifest.js: lista de todos os arquivos que o service worker guarda
 *     no aparelho (para funcionar offline) + uma versão baseada no conteúdo.
 *  2. Com --www, copia o app para www/ (pasta usada pelo Capacitor para gerar o APK).
 *
 * Uso: node tools/build-web.mjs [--www]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Tudo que o app precisa em tempo de execução (nada de tools/, tests/, .cache/).
const ENTRIES = ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'sw.js', 'core', 'data', 'engine', 'ui', 'assets'];

/** Lista arquivos recursivamente. Ex.: walk('ui') → ['ui/dom.js', ...] */
function walk(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return [rel];
  return fs.readdirSync(abs).sort().flatMap((f) => walk(path.posix.join(rel, f)));
}

const files = ENTRIES.flatMap(walk).filter((f) => f !== 'sw.js' && !f.endsWith('.DS_Store'));
const hash = crypto.createHash('sha256');
files.forEach((f) => hash.update(f).update(fs.readFileSync(path.join(ROOT, f))));
const version = hash.digest('hex').slice(0, 12);
const manifest = `/* ARQUIVO GERADO por tools/build-web.mjs — lista de arquivos para uso offline */\nself.PTA_PRECACHE = ${JSON.stringify({ version, files: ['./'].concat(files) })};\n`;
fs.writeFileSync(path.join(ROOT, 'sw-manifest.js'), manifest);
console.log(`[sw] ${files.length} arquivos, versão ${version}`);

if (process.argv.includes('--www')) {
  const out = path.join(ROOT, 'www');
  fs.rmSync(out, { recursive: true, force: true });
  for (const f of files.concat(['sw.js', 'sw-manifest.js'])) {
    const dest = path.join(out, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), dest);
  }
  console.log(`[www] app copiado para www/ (${files.length + 2} arquivos)`);
}
