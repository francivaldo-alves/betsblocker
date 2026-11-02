// Gera a lista nativa de anúncios e rastreadores a partir do hosts unificado do StevenBlack (MIT).
// Uso: node scripts/update-ads-list.mjs
import { writeFileSync } from 'node:fs';

const SOURCE = 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts';
const OUTPUT = 'modules/expo-vpn-blocker/android/src/main/assets/ads-trackers.txt';

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`Falha ao baixar a lista: ${response.status}`);

const domains = new Set();
for (const line of (await response.text()).split('\n')) {
  const match = line.match(/^0\.0\.0\.0\s+([a-z0-9.-]+\.[a-z0-9-]+)\s*(#.*)?$/i);
  if (match && match[1] !== '0.0.0.0') domains.add(match[1].toLowerCase());
}

// O filtro nativo já cobre subdomínios, então filhos de um domínio presente são redundantes
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
const header = `# Fonte: ${SOURCE} (MIT) - gerado em ${new Date().toISOString().slice(0, 10)}`;
writeFileSync(OUTPUT, `${header}\n${compact.join('\n')}\n`);
console.log(`${domains.size} domínios, ${compact.length} após compactar`);
