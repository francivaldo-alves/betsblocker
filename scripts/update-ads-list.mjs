// Gera a lista nativa de anúncios e rastreadores somando HaGeZi Multi (GPL-3.0) e StevenBlack (MIT).
// Uso: node scripts/update-ads-list.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCES = [
  'https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/wildcard/multi-onlydomains.txt',
  'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
];
const OUTPUT = 'modules/expo-vpn-blocker/android/src/main/assets/ads-trackers.txt';
const EXTRA = 'scripts/ads-extra.txt';
// Abaixo disso, uma fonte quebrou: melhor falhar do que publicar uma lista esvaziada
const MIN_DOMAINS = 50000;
const ALLOW = 'scripts/ads-allow.txt';

const readDomains = (text) =>
  text
    .split('\n')
    .map((line) => line.replace(/^0\.0\.0\.0\s+/, '').trim().split(/\s/)[0].toLowerCase())
    .filter((line) => line.includes('.') && !line.startsWith('#') && !/^[\d.]+$/.test(line));

const responses = await Promise.all(SOURCES.map((url) => fetch(url)));
for (const response of responses) {
  if (!response.ok) throw new Error(`Falha ao baixar ${response.url}: ${response.status}`);
}
const downloaded = await Promise.all(responses.map((response) => response.text()));

const domains = new Set([
  ...downloaded.flatMap(readDomains),
  ...readDomains(readFileSync(EXTRA, 'utf8')),
]);
// O filtro nativo bloqueia subdomínios, então liberar um domínio exige tirar também os pais dele
for (const allowed of readDomains(readFileSync(ALLOW, 'utf8'))) {
  let domain = allowed;
  while (domain.includes('.')) {
    if (domains.delete(domain) && domain !== allowed) {
      console.warn(`${domain} removido para liberar ${allowed}`);
    }
    domain = domain.slice(domain.indexOf('.') + 1);
  }
}
if (domains.size < MIN_DOMAINS) throw new Error(`Lista suspeita: apenas ${domains.size} domínios`);

// O filtro nativo já cobre subdomínios, então filhos de um domínio presente são redundantes.
// A ordem padrão equivale à ordem de bytes que a busca binária nativa exige (domínios são ASCII)
const hasListedParent = (domain) => {
  let dot = domain.indexOf('.');
  while (dot >= 0) {
    domain = domain.slice(dot + 1);
    if (domains.has(domain)) return true;
    dot = domain.indexOf('.');
  }
  return false;
};

const compact = [...domains].filter((domain) => !hasListedParent(domain)).sort();
const header = `# Fontes: HaGeZi Multi (GPL-3.0) e StevenBlack (MIT) - gerado em ${new Date().toISOString().slice(0, 10)}`;
writeFileSync(OUTPUT, `${header}\n${compact.join('\n')}\n`);
console.log(`${domains.size} domínios, ${compact.length} após compactar`);
