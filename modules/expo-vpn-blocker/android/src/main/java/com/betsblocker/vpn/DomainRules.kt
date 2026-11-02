package com.betsblocker.vpn

// Sem data de expiração: a exceção vale até ser removida
const val NEVER_EXPIRES = 0L

enum class DomainDecision { ALLOW, GAMBLING, ADS }

// Fotografia imutável das regras: a troca é atômica e a leitura não copia nada por pacote
data class RuleSnapshot(
  val blocked: Set<String> = emptySet(),
  val wildcards: List<String> = emptyList(),
  val exceptions: Map<String, Long> = emptyMap(),
  val adsTrackers: SortedDomainSet? = null,
  val auditOnly: Boolean = false
)

object DomainRules {
  // Mantida igual a PROTECTED_SYSTEM_DOMAINS em domain-validator.ts (um teste Jest compara as duas)
  val PROTECTED_DOMAINS = setOf(
    "apple.com",
    "cloudflare.com",
    "dns.google",
    "g1.com.br",
    "globo.com",
    "google.com",
    "google.com.br",
    "googleapis.com",
    "gov.br",
    "gstatic.com",
    "localhost",
    "microsoft.com",
    "one.one.one.one",
    "stf.jus.br",
    "whatsapp.com",
    "whatsapp.net"
  )

  // Domínios de anúncios dentro da infraestrutura protegida, filtrados só com o bloqueio de anúncios ligado
  private val PROTECTED_AD_DOMAINS = setOf("adservice.google.com", "analytics.google.com")

  /**
   * Percorre o domínio e cada domínio pai (www.bet365.com -> bet365.com -> com)
   */
  private inline fun anyDomainOrParent(domain: String, matches: (String) -> Boolean): Boolean {
    var candidate = domain
    while (true) {
      if (matches(candidate)) return true
      val nextLabel = candidate.indexOf('.')
      if (nextLabel < 0) return false
      candidate = candidate.substring(nextLabel + 1)
    }
  }

  private fun isExcepted(domain: String, rules: RuleSnapshot, nowMillis: Long): Boolean {
    if (rules.exceptions.isEmpty()) return false
    return anyDomainOrParent(domain) { candidate ->
      val expiresAt = rules.exceptions[candidate]
      expiresAt != null && (expiresAt == NEVER_EXPIRES || expiresAt > nowMillis)
    }
  }

  /**
   * Decide o destino de um domínio. A exceção do usuário vale sobre regras exatas, de domínio pai
   * e curingas; expira sozinha, mesmo com o app fechado.
   */
  fun classify(domain: String, rules: RuleSnapshot, nowMillis: Long): DomainDecision {
    val clean = domain.trim().lowercase()
    if (clean.isEmpty()) return DomainDecision.ALLOW
    if (isExcepted(clean, rules, nowMillis)) return DomainDecision.ALLOW

    val adsTrackers = rules.adsTrackers
    if (adsTrackers != null && anyDomainOrParent(clean) { it in PROTECTED_AD_DOMAINS }) {
      return DomainDecision.ADS
    }

    // Salvaguarda: sites e infraestrutura essencial da internet nunca são bloqueados
    if (anyDomainOrParent(clean) { it in PROTECTED_DOMAINS }) return DomainDecision.ALLOW

    if (anyDomainOrParent(clean) { it in rules.blocked }) return DomainDecision.GAMBLING

    for (wildcard in rules.wildcards) {
      val suffix = wildcard.removePrefix("*.")
      if (clean == suffix || clean.endsWith(".$suffix")) return DomainDecision.GAMBLING
    }

    if (adsTrackers != null && anyDomainOrParent(clean) { adsTrackers.contains(it) }) {
      return DomainDecision.ADS
    }
    return DomainDecision.ALLOW
  }
}
