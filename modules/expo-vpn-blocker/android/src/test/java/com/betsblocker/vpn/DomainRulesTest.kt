package com.betsblocker.vpn

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DomainRulesTest {
  private val now = 1_000_000L
  private val ads = SortedDomainSet.fromBytes("# comentario\r\nads.net\r\ntracker.io\r\n".toByteArray())

  private fun classify(domain: String, rules: RuleSnapshot) = DomainRules.classify(domain, rules, now)

  @Test
  fun blocksExactDomainSubdomainsAndWildcards() {
    val rules = RuleSnapshot(blocked = setOf("bet365.com"), wildcards = listOf("*.bet"))
    assertEquals(DomainDecision.GAMBLING, classify("bet365.com", rules))
    assertEquals(DomainDecision.GAMBLING, classify("WWW.Bet365.com", rules))
    assertEquals(DomainDecision.GAMBLING, classify("qualquer.bet", rules))
    assertEquals(DomainDecision.ALLOW, classify("notbet365.com", rules))
    assertEquals(DomainDecision.ALLOW, classify("bet.com", rules))
  }

  @Test
  fun protectedDomainsAreNeverBlocked() {
    val rules = RuleSnapshot(blocked = setOf("google.com"), wildcards = listOf("*.com"), adsTrackers = ads)
    assertEquals(DomainDecision.ALLOW, classify("mail.google.com", rules))
    assertEquals(DomainDecision.ADS, classify("adservice.google.com", rules))
  }

  @Test
  fun exceptionOverridesParentAndWildcardRules() {
    val rules = RuleSnapshot(
      blocked = setOf("bet365.com"),
      wildcards = listOf("*.bet"),
      exceptions = mapOf("help.bet365.com" to NEVER_EXPIRES, "site.bet" to NEVER_EXPIRES)
    )
    assertEquals(DomainDecision.ALLOW, classify("help.bet365.com", rules))
    assertEquals(DomainDecision.ALLOW, classify("www.site.bet", rules))
    assertEquals(DomainDecision.GAMBLING, classify("www.bet365.com", rules))
  }

  @Test
  fun expiredExceptionStopsWorkingWithoutAnyUpdate() {
    val rules = RuleSnapshot(
      blocked = setOf("bet365.com"),
      exceptions = mapOf("bet365.com" to now + 1)
    )
    assertEquals(DomainDecision.ALLOW, DomainRules.classify("bet365.com", rules, now))
    assertEquals(DomainDecision.GAMBLING, DomainRules.classify("bet365.com", rules, now + 1))
  }

  @Test
  fun adsAreOnlyMatchedWhenListIsLoaded() {
    assertEquals(DomainDecision.ADS, classify("cdn.ads.net", RuleSnapshot(adsTrackers = ads)))
    assertEquals(DomainDecision.ALLOW, classify("cdn.ads.net", RuleSnapshot()))
  }

  @Test
  fun sortedSetIgnoresCommentsAndCrlf() {
    assertEquals(2, ads.size)
    assertTrue(ads.contains("ads.net"))
    assertTrue(ads.contains("tracker.io"))
    assertFalse(ads.contains("ads.ne"))
    assertFalse(ads.contains("# comentario"))
    assertFalse(ads.contains("zzz.com"))
  }
}
