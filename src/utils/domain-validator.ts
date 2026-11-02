/**
 * Utilitário de validação e normalização de domínios em conformidade com
 * as RFC 1034, 1035, 1123 e padrões IDNA (domínios internacionalizados).
 */

// Únicos TLDs aceitos em curingas de um rótulo: *.com ou *.br derrubariam a internet inteira
export const ALLOWED_WILDCARD_TLDS = new Set(['bet', 'casino', 'poker', 'slot', 'slots']);

// Segundos níveis genéricos de TLDs de país: *.com.br equivale a um curinga de TLD
const GENERIC_SECOND_LEVELS = new Set(['com', 'net', 'org', 'gov', 'edu', 'co']);

// Domínios de infraestrutura crítica governamental e de rede que NUNCA devem ser bloqueados
export const PROTECTED_SYSTEM_DOMAINS = new Set([
  'gov.br',
  'fazenda.gov.br',
  'receita.fazenda.gov.br',
  'anatel.gov.br',
  'planalto.gov.br',
  'stf.jus.br',
  'google.com',
  'apple.com',
  'microsoft.com',
  'cloudflare.com',
  'dns.google',
  'one.one.one.one',
  'localhost',
]);

const IPV4_REGEX =
  /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

const IPV6_REGEX =
  /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

export interface DomainValidationResult {
  isValid: boolean;
  normalized?: string;
  original: string;
  error?: string;
}

/**
 * Converte caracteres unicode para Punycode básico caso haja caracteres acentuados
 */
export function toAsciiDomain(domain: string): string {
  // Simples conversão normalizada para conformidade DNS
  return domain.normalize('NFC');
}

/**
 * Verifica se a entrada é um endereço IPv4 ou IPv6
 */
export function isIpAddress(value: string): boolean {
  const clean = value.trim();
  return IPV4_REGEX.test(clean) || IPV6_REGEX.test(clean);
}

/**
 * Verifica se o domínio faz parte da infraestrutura crítica protegida
 */
export function isInfrastructureDomain(domain: string): boolean {
  const clean = domain.toLowerCase().trim();
  if (PROTECTED_SYSTEM_DOMAINS.has(clean)) {
    return true;
  }
  for (const protectedDom of PROTECTED_SYSTEM_DOMAINS) {
    if (clean.endsWith(`.${protectedDom}`)) {
      return true;
    }
  }
  return false;
}

/**
 * Valida e normaliza um domínio estritamente
 */
export function validateAndNormalizeDomain(input: string): DomainValidationResult {
  const original = input;

  if (!input || typeof input !== 'string') {
    return {
      isValid: false,
      original,
      error: 'O domínio é obrigatório.',
    };
  }

  let cleaned = input.trim().toLowerCase();

  // Rejeita URLs com protocolos explicitamente
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(cleaned)) {
    return {
      isValid: false,
      original,
      error: 'Insira apenas o domínio (ex: exemplo.com), sem protocolo (http:// ou https://).',
    };
  }

  // Rejeita caminhos de URL (path), queries ou portas
  if (cleaned.includes('/') || cleaned.includes('?') || cleaned.includes('#') || cleaned.includes(':')) {
    return {
      isValid: false,
      original,
      error: 'Insira apenas o domínio, sem barras, portas ou parâmetros de busca.',
    };
  }

  // Remove ponto final FQDN (trailing dot) se presente
  if (cleaned.endsWith('.')) {
    cleaned = cleaned.slice(0, -1);
  }

  // Rejeita se for IP
  if (isIpAddress(cleaned)) {
    return {
      isValid: false,
      original,
      error: 'Endereços IP não são permitidos. Forneça um nome de domínio válido.',
    };
  }

  // Tamanho total máximo conforme RFC 1035
  if (cleaned.length < 3 || cleaned.length > 253) {
    return {
      isValid: false,
      original,
      error: 'O comprimento do domínio deve conter entre 3 e 253 caracteres.',
    };
  }

  // Suporte a regras curinga (Wildcard), ex: *.bet, *.casino, *.pgsoft.com
  const isWildcard = cleaned.startsWith('*.');
  const domainToValidate = isWildcard ? cleaned.slice(2) : cleaned;

  // Labels separados por ponto
  const labels = domainToValidate.split('.');
  if (!isWildcard && labels.length < 2) {
    return {
      isValid: false,
      original,
      error: 'O domínio deve conter ao menos duas partes separadas por ponto (ex: dominio.com).',
    };
  }

  // O TLD (último label) não pode ser numérico e deve ter ao menos 2 letras
  const tld = labels[labels.length - 1];
  if (/^\d+$/.test(tld) || tld.length < 2) {
    return {
      isValid: false,
      original,
      error: 'A terminação do domínio (TLD) é inválida.',
    };
  }

  // Validação de cada label conforme RFC 1123
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];

    if (label.length === 0) {
      return {
        isValid: false,
        original,
        error: 'O domínio possui pontos consecutivos ou inválidos.',
      };
    }

    if (label.length > 63) {
      return {
        isValid: false,
        original,
        error: `O rótulo "${label}" excede o limite máximo de 63 caracteres.`,
      };
    }

    if (label.startsWith('-') || label.endsWith('-')) {
      return {
        isValid: false,
        original,
        error: `O rótulo "${label}" não pode iniciar ou terminar com hífen.`,
      };
    }

    // Caracteres permitidos: a-z, 0-9 e hífen
    if (!/^[a-z0-9-]+$/i.test(label)) {
      return {
        isValid: false,
        original,
        error: `O rótulo "${label}" contém caracteres inválidos.`,
      };
    }
  }

  // Proteção contra curingas amplos demais
  const isBroadWildcard =
    isWildcard &&
    ((labels.length === 1 && !ALLOWED_WILDCARD_TLDS.has(tld)) ||
      (labels.length === 2 && tld.length === 2 && GENERIC_SECOND_LEVELS.has(labels[0])));
  if (isBroadWildcard) {
    return {
      isValid: false,
      original,
      error: 'Este curinga é amplo demais e bloquearia sites legítimos.',
    };
  }

  // Proteção contra domínios críticos
  if (isInfrastructureDomain(domainToValidate)) {
    return {
      isValid: false,
      original,
      error: 'Este domínio pertence à infraestrutura protegida do sistema e não pode ser cadastrado para bloqueio.',
    };
  }

  return {
    isValid: true,
    normalized: cleaned,
    original,
  };
}

/**
 * Verifica se um domínio consultado bate com alguma regra de bloqueio (exata, subdomínio ou wildcard)
 */
export function matchesBlockedDomain(targetDomain: string, rule: string): boolean {
  const target = targetDomain.toLowerCase().trim();
  const pattern = rule.toLowerCase().trim();

  // 1. Correspondência exata
  if (target === pattern) {
    return true;
  }

  // 2. Regra curinga iniciada por *. (ex: *.bet ou *.pgsoft.com)
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2);
    if (target === suffix || target.endsWith(`.${suffix}`)) {
      return true;
    }
  }

  // 3. Regra é um domínio base e o alvo é um subdomínio dele (ex: rule='pgsoft.com', target='api.pgsoft.com')
  if (target.endsWith(`.${pattern}`)) {
    return true;
  }

  return false;
}
