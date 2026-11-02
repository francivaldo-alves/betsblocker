import {
  validateAndNormalizeDomain,
  isIpAddress,
  isInfrastructureDomain,
} from '../domain-validator';
import { classifierService } from '@/services/classifier.service';
import { blocklistManifestSchema, blocklistEntrySchema } from '@/services/blocklist-sync.service';

export interface TestResult {
  suiteName: string;
  total: number;
  passed: number;
  failed: number;
  errors: string[];
}

export function runComprehensiveTests(): TestResult[] {
  const results: TestResult[] = [];

  // ==========================================
  // SUÍTE 1: NORMALIZAÇÃO E VALIDAÇÃO RFC
  // ==========================================
  {
    const suite: TestResult = {
      suiteName: '1. Normalização e Validação DNS (RFC 1034/1035/1123)',
      total: 0,
      passed: 0,
      failed: 0,
      errors: [],
    };

    const cases = [
      { input: 'apostas-autorizadas.bet.br', valid: true, expected: 'apostas-autorizadas.bet.br' },
      { input: '  CAPS-LOWER.COM  ', valid: true, expected: 'caps-lower.com' },
      { input: 'site.org.', valid: true, expected: 'site.org' }, // Trailing dot FQDN
      { input: '-comecacomhifen.com', valid: false },
      { input: 'terminacomhifen-.com', valid: false },
      { input: 'semtld', valid: false },
      { input: 'tld.123', valid: false },
      { input: 'a'.repeat(64) + '.com', valid: false }, // Label > 63 chars
      { input: 'dominio..duplo.com', valid: false },
    ];

    for (const c of cases) {
      suite.total++;
      const res = validateAndNormalizeDomain(c.input);
      if (res.isValid !== c.valid) {
        suite.failed++;
        suite.errors.push(`[${c.input}]: esperado valid=${c.valid}, obtido=${res.isValid}`);
      } else if (c.valid && res.normalized !== c.expected) {
        suite.failed++;
        suite.errors.push(`[${c.input}]: esperado normalized=${c.expected}, obtido=${res.normalized}`);
      } else {
        suite.passed++;
      }
    }
    results.push(suite);
  }

  // ==========================================
  // SUÍTE 2: REJEIÇÃO DE URLS E IPs
  // ==========================================
  {
    const suite: TestResult = {
      suiteName: '2. Rejeição de URLs Completas e Endereços IP',
      total: 0,
      passed: 0,
      failed: 0,
      errors: [],
    };

    const cases = [
      { input: 'https://exemplo.bet.br', reason: 'protocolo https' },
      { input: 'http://exemplo.bet.br', reason: 'protocolo http' },
      { input: 'ftp://exemplo.bet.br', reason: 'protocolo ftp' },
      { input: 'exemplo.com/caminho/pagina', reason: 'caminho de URL' },
      { input: 'exemplo.com?promo=123', reason: 'query string' },
      { input: 'exemplo.com:8080', reason: 'porta TCP' },
      { input: '192.168.1.1', reason: 'IPv4' },
      { input: '10.0.0.1', reason: 'IPv4' },
      { input: '::1', reason: 'IPv6' },
      { input: '2001:db8::ff00:42:8329', reason: 'IPv6' },
    ];

    for (const c of cases) {
      suite.total++;
      const res = validateAndNormalizeDomain(c.input);
      if (res.isValid) {
        suite.failed++;
        suite.errors.push(`Esperava rejeição para "${c.input}" (${c.reason}), mas foi aceito.`);
      } else {
        suite.passed++;
      }
    }
    results.push(suite);
  }

  // ==========================================
  // SUÍTE 3: PROTEÇÃO DE INFRAESTRUTURA
  // ==========================================
  {
    const suite: TestResult = {
      suiteName: '3. Proteção Contra Falsos Positivos de Infraestrutura',
      total: 0,
      passed: 0,
      failed: 0,
      errors: [],
    };

    const protectedList = [
      'gov.br',
      'fazenda.gov.br',
      'receita.fazenda.gov.br',
      'anatel.gov.br',
      'planalto.gov.br',
      'stf.jus.br',
      'google.com',
      'apple.com',
      'cloudflare.com',
      'dns.google',
    ];

    for (const dom of protectedList) {
      suite.total++;
      const res = validateAndNormalizeDomain(dom);
      if (res.isValid) {
        suite.failed++;
        suite.errors.push(`Domínio crítico "${dom}" deveria ser rejeitado para bloqueio!`);
      } else {
        suite.passed++;
      }
    }
    results.push(suite);
  }

  // ==========================================
  // SUÍTE 4: CLASSIFICAÇÃO REGULATÓRIA
  // ==========================================
  {
    const suite: TestResult = {
      suiteName: '4. Regras de Classificação e Separação de Bloqueio',
      total: 0,
      passed: 0,
      failed: 0,
      errors: [],
    };

    // Caso A: Domínio com substring "bet" que é autorizado
    suite.total++;
    const decAuth = classifierService.evaluateDomain('AUTHORIZED', true);
    if (decAuth.classificationStatus === 'AUTHORIZED' && decAuth.blockStatus === 'ALLOW') {
      suite.passed++;
    } else {
      suite.failed++;
      suite.errors.push('Domínio AUTHORIZED deveria ter blockStatus=ALLOW.');
    }

    // Caso B: Domínio não autorizado com evidência
    suite.total++;
    const decUnauth = classifierService.evaluateDomain('UNAUTHORIZED_CONFIRMED', true);
    if (decUnauth.classificationStatus === 'UNAUTHORIZED_CONFIRMED' && decUnauth.blockStatus === 'BLOCK') {
      suite.passed++;
    } else {
      suite.failed++;
      suite.errors.push('Domínio UNAUTHORIZED_CONFIRMED deveria ter blockStatus=BLOCK.');
    }

    // Caso C: Domínio pendente de análise (não deve bloquear sem prova)
    suite.total++;
    const decPending = classifierService.evaluateDomain('PENDING_REVIEW', false);
    if (decPending.classificationStatus === 'PENDING_REVIEW' && decPending.blockStatus === 'ALLOW') {
      suite.passed++;
    } else {
      suite.failed++;
      suite.errors.push('Domínio PENDING_REVIEW não deve ter blockStatus=BLOCK sem evidência.');
    }

    // Caso D: Exceção manual sobrepõe decisão de bloqueio
    suite.total++;
    const blockWithException = classifierService.resolveBlockStatus('UNAUTHORIZED_CONFIRMED', true);
    if (blockWithException === 'ALLOW') {
      suite.passed++;
    } else {
      suite.failed++;
      suite.errors.push('Exceção ativa do usuário deve forçar blockStatus=ALLOW.');
    }

    results.push(suite);
  }

  // ==========================================
  // SUÍTE 5: INTEGRIDADE DO MANIFESTO E SCHEMA
  // ==========================================
  {
    const suite: TestResult = {
      suiteName: '5. Validação Estrutural de Manifesto (Zod Schema)',
      total: 0,
      passed: 0,
      failed: 0,
      errors: [],
    };

    // Manifesto Válido
    suite.total++;
    const validManifest = {
      version: 1,
      generatedAt: '2026-11-01T00:00:00Z',
      source: 'official_sources',
      recordCount: 5,
      checksum: '824bf248cd1645fddea8894da15e91f3847b88667d5a237172a0eaaca6c56d9a',
    };
    const p1 = blocklistManifestSchema.safeParse(validManifest);
    if (p1.success) {
      suite.passed++;
    } else {
      suite.failed++;
      suite.errors.push('Manifesto válido foi rejeitado pelo schema Zod.');
    }

    // Manifesto Inválido (sem checksum)
    suite.total++;
    const invalidManifest = {
      version: 1,
      generatedAt: '2026-11-01T00:00:00Z',
      source: 'official_sources',
      recordCount: 5,
    };
    const p2 = blocklistManifestSchema.safeParse(invalidManifest);
    if (!p2.success) {
      suite.passed++;
    } else {
      suite.failed++;
      suite.errors.push('Manifesto sem checksum deveria ter sido rejeitado.');
    }

    results.push(suite);
  }

  return results;
}
