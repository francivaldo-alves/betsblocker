import { validateAndNormalizeDomain, isIpAddress, isInfrastructureDomain } from '../domain-validator';

export function runDomainValidatorTests() {
  const testCases = [
    // Válidos
    { input: 'exemplo.com', expectedValid: true, expectedNormalized: 'exemplo.com' },
    { input: '  SUB.DOMINIO.BET.BR  ', expectedValid: true, expectedNormalized: 'sub.dominio.bet.br' },
    { input: 'apostas-online123.com.br', expectedValid: true, expectedNormalized: 'apostas-online123.com.br' },
    { input: 'site.org.', expectedValid: true, expectedNormalized: 'site.org' }, // Trailing dot removido

    // Rejeição de URLs completas
    { input: 'https://exemplo.com', expectedValid: false },
    { input: 'http://site.com/path/to/page', expectedValid: false },
    { input: 'site.com:8080', expectedValid: false },
    { input: 'site.com/home', expectedValid: false },
    { input: 'site.com?param=1', expectedValid: false },

    // Rejeição de Endereços IP
    { input: '192.168.1.1', expectedValid: false },
    { input: '10.0.0.1', expectedValid: false },
    { input: '::1', expectedValid: false },
    { input: '2001:db8::1', expectedValid: false },

    // Caracteres ilegais e formatos inválidos
    { input: '-iniciocomhifen.com', expectedValid: false },
    { input: 'terminacomhifen-.com', expectedValid: false },
    { input: 'semtld', expectedValid: false },
    { input: 'tldinvalido.123', expectedValid: false },
    { input: '', expectedValid: false },
    { input: 'dominio..com', expectedValid: false },

    // Proteção de infraestrutura
    { input: 'gov.br', expectedValid: false },
    { input: 'fazenda.gov.br', expectedValid: false },
    { input: 'google.com', expectedValid: false },
  ];

  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const tc of testCases) {
    const result = validateAndNormalizeDomain(tc.input);
    if (result.isValid !== tc.expectedValid) {
      failed++;
      errors.push(`Falha no caso "${tc.input}": esperado isValid=${tc.expectedValid}, obtido=${result.isValid} (${result.error})`);
    } else if (tc.expectedValid && tc.expectedNormalized && result.normalized !== tc.expectedNormalized) {
      failed++;
      errors.push(`Falha na normalização de "${tc.input}": esperado "${tc.expectedNormalized}", obtido "${result.normalized}"`);
    } else {
      passed++;
    }
  }

  return { total: testCases.length, passed, failed, errors };
}
