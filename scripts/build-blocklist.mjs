// Gera o manifesto da lista de apostas (versão, contagem e SHA-256) e, com uma chave, assina-o.
// Uso:
//   node scripts/build-blocklist.mjs <versão> [chave-privada.pem]
//   node scripts/build-blocklist.mjs --generate-key <chave-privada.pem>
// A chave privada nunca entra no repositório; a pública vai em app.json (extra.blocklist.publicKey).
import { Buffer } from 'node:buffer';
import { createHash, createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const LIST = 'assets/data/initial-blocklist.json';
const MANIFEST = 'assets/data/blocklist-manifest.json';

const [first, second] = process.argv.slice(2);

if (first === '--generate-key') {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  writeFileSync(second, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  console.log(`Chave pública para app.json:\n${publicKey.export({ type: 'spki', format: 'der' }).toString('base64')}`);
  process.exit(0);
}

const version = Number(first);
if (!Number.isInteger(version) || version <= 0) throw new Error('Informe a versão da lista.');

const entries = JSON.parse(readFileSync(LIST, 'utf8'));
const checksum = createHash('sha256').update(JSON.stringify(entries, null, 2)).digest('hex');

const manifest = {
  version,
  generatedAt: new Date().toISOString(),
  source: 'curated_list',
  recordCount: entries.length,
  checksum,
};

if (second) {
  const key = createPrivateKey(readFileSync(second));
  manifest.signature = sign('sha256', Buffer.from(`${version}:${checksum}`), key).toString('base64');
}

writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Manifesto da versão ${version} gerado com ${entries.length} registros`);
