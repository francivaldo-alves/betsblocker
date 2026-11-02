import { readFileSync } from 'node:fs';
import {
  PROTECTED_SYSTEM_DOMAINS,
  matchesBlockedDomain,
  validateAndNormalizeDomain,
} from '../domain-validator';

describe('validateAndNormalizeDomain', () => {
  it.each([
    ['exemplo.com', 'exemplo.com'],
    ['  SUB.DOMINIO.BET.BR  ', 'sub.dominio.bet.br'],
    ['apostas-online123.com.br', 'apostas-online123.com.br'],
    ['site.org.', 'site.org'],
    ['*.bet', '*.bet'],
    ['*.bet.br', '*.bet.br'],
  ])('aceita %s', (input, normalized) => {
    expect(validateAndNormalizeDomain(input)).toMatchObject({ isValid: true, normalized });
  });

  it.each([
    'https://exemplo.com',
    'site.com:8080',
    'site.com/home',
    'site.com?param=1',
    '192.168.1.1',
    '::1',
    '2001:db8::1',
    '-iniciocomhifen.com',
    'terminacomhifen-.com',
    'semtld',
    'tldinvalido.123',
    '',
    'dominio..com',
    `${'a'.repeat(64)}.com`,
    '*.com',
    '*.com.br',
  ])('rejeita %s', (input) => {
    expect(validateAndNormalizeDomain(input).isValid).toBe(false);
  });

  it.each(['gov.br', 'fazenda.gov.br', 'google.com', 'mail.google.com', 'apple.com', 'dns.google'])(
    'protege a infraestrutura %s',
    (input) => {
      expect(validateAndNormalizeDomain(input).isValid).toBe(false);
    }
  );
});

describe('matchesBlockedDomain', () => {
  it('cobre subdomínios sem confundir nomes parecidos', () => {
    expect(matchesBlockedDomain('api.pgsoft.com', 'pgsoft.com')).toBe(true);
    expect(matchesBlockedDomain('x.bet', '*.bet')).toBe(true);
    expect(matchesBlockedDomain('notpgsoft.com', 'pgsoft.com')).toBe(false);
  });
});

describe('salvaguardas', () => {
  it('mantém a lista nativa igual à do TypeScript', () => {
    const kotlin = readFileSync(
      'modules/expo-vpn-blocker/android/src/main/java/com/betsblocker/vpn/DomainRules.kt',
      'utf8'
    );
    const block = kotlin.match(/PROTECTED_DOMAINS = setOf\(([\s\S]*?)\)/)![1];
    const nativeDomains = [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    expect(nativeDomains).toEqual([...PROTECTED_SYSTEM_DOMAINS]);
  });
});

describe('lista de anúncios', () => {
  it('fica em ordem de bytes para a busca binária nativa', () => {
    const lines = readFileSync(
      'modules/expo-vpn-blocker/android/src/main/assets/ads-trackers.txt',
      'latin1'
    )
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line && !line.startsWith('#'));

    expect(lines.length).toBeGreaterThan(50000);
    for (let i = 1; i < lines.length; i++) {
      if (Buffer.compare(Buffer.from(lines[i - 1]), Buffer.from(lines[i])) >= 0) {
        throw new Error(`Fora de ordem: ${lines[i - 1]} / ${lines[i]}`);
      }
    }
  });
});
