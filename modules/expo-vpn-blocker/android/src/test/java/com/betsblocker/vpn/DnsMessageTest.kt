package com.betsblocker.vpn

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.security.KeyPairGenerator
import java.security.Signature

class DnsMessageTest {
  private fun question(domain: String): ByteArray {
    val out = ByteArrayOutputStream()
    for (label in domain.split('.')) {
      out.write(label.length)
      out.write(label.toByteArray())
    }
    out.write(byteArrayOf(0, 0, 1, 0, 1)) // Fim do nome, QTYPE=A, QCLASS=IN
    return out.toByteArray()
  }

  private fun packet(domain: String, protocol: Int = 17, port: Int = 53, trailer: ByteArray = ByteArray(0)): ByteArray {
    val dns = byteArrayOf(0x12, 0x34, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0) + question(domain) + trailer
    val packet = ByteArray(28 + dns.size)
    packet[0] = 0x45
    packet[9] = protocol.toByte()
    byteArrayOf(10, 111, 222.toByte(), 1).copyInto(packet, 12)
    byteArrayOf(10, 111, 222.toByte(), 2).copyInto(packet, 16)
    packet[20] = 0xC0.toByte()
    packet[21] = 0x01
    packet[22] = (port shr 8).toByte()
    packet[23] = (port and 0xFF).toByte()
    packet[24] = ((dns.size + 8) shr 8).toByte()
    packet[25] = ((dns.size + 8) and 0xFF).toByte()
    dns.copyInto(packet, 28)
    return packet
  }

  private fun sum(bytes: ByteArray, from: Int, to: Int): Int {
    var total = 0
    var i = from
    while (i < to) {
      val high = bytes[i].toInt() and 0xFF
      val low = if (i + 1 < to) bytes[i + 1].toInt() and 0xFF else 0
      total += (high shl 8) or low
      i += 2
    }
    while (total shr 16 != 0) total = (total and 0xFFFF) + (total shr 16)
    return total
  }

  @Test
  fun parsesDomainAndPorts() {
    val data = packet("WWW.Bet365.com")
    val query = DnsMessage.parseQuery(data, data.size)!!
    assertEquals("www.bet365.com", query.domain)
    assertEquals(0xC001, query.clientPort)
    assertEquals(53, query.serverPort)
  }

  @Test
  fun rejectsNonDnsTrafficAndMalformedPackets() {
    val tcp = packet("a.com", protocol = 6)
    val http = packet("a.com", port = 80)
    val ipv6 = packet("a.com").also { it[0] = 0x60 }
    val badLength = packet("a.com").also { it[24] = 0x7F }
    assertNull(DnsMessage.parseQuery(tcp, tcp.size))
    assertNull(DnsMessage.parseQuery(http, http.size))
    assertNull(DnsMessage.parseQuery(ipv6, ipv6.size))
    assertNull(DnsMessage.parseQuery(badLength, badLength.size))
    assertNull(DnsMessage.parseQuery(ByteArray(10), 10))
  }

  @Test
  fun doesNotCrashOnLabelPastEndOfPacket() {
    val data = packet("a.com")
    data[40] = 63
    assertNotNull(DnsMessage.parseQuery(data, data.size))
  }

  @Test
  fun errorResponseKeepsIdAndOnlyTheQuestion() {
    val data = packet("a.com", trailer = ByteArray(11))
    val query = DnsMessage.parseQuery(data, data.size)!!
    val response = DnsMessage.errorResponse(query, DnsMessage.RCODE_NXDOMAIN)

    assertEquals(0x12, response[0].toInt())
    assertEquals(0x34, response[1].toInt())
    assertEquals(3, response[3].toInt() and 0x0F)
    assertEquals(1, response[5].toInt())
    assertArrayEquals(question("a.com"), response.copyOfRange(12, response.size))
  }

  @Test
  fun udpResponseSwapsAddressesAndHasValidChecksums() {
    val data = packet("a.com")
    val query = DnsMessage.parseQuery(data, data.size)!!
    val response = DnsMessage.buildUdpResponse(query, DnsMessage.errorResponse(query, 3))

    assertEquals(2, response[15].toInt())
    assertEquals(1, response[19].toInt())
    assertEquals(0xC001, ((response[22].toInt() and 0xFF) shl 8) or (response[23].toInt() and 0xFF))
    assertEquals(0xFFFF, sum(response, 0, 20))

    val udpLength = response.size - 20
    val pseudo = response.copyOfRange(12, 20) + byteArrayOf(0, 17, (udpLength shr 8).toByte(), udpLength.toByte())
    assertEquals(0xFFFF, sum(pseudo + response.copyOfRange(20, response.size), 0, pseudo.size + udpLength))
  }

  @Test
  fun detectsTruncationAndForeignReplies() {
    val data = packet("a.com")
    val query = DnsMessage.parseQuery(data, data.size)!!
    val reply = DnsMessage.errorResponse(query, 0)

    assertTrue(DnsMessage.isReplyTo(query, reply, reply.size))
    assertFalse(DnsMessage.isTruncated(reply))
    reply[2] = (reply[2].toInt() or 0x02).toByte()
    assertTrue(DnsMessage.isTruncated(reply))
    reply[0] = 0x55
    assertFalse(DnsMessage.isReplyTo(query, reply, reply.size))
  }

  @Test
  fun verifiesEcdsaSignatures() {
    val keys = KeyPairGenerator.getInstance("EC").apply { initialize(256) }.generateKeyPair()
    val message = "4:abc".toByteArray()
    val signature = Signature.getInstance("SHA256withECDSA").run {
      initSign(keys.private)
      update(message)
      sign()
    }

    assertTrue(SignatureVerifier.verify(message, signature, keys.public.encoded))
    assertFalse(SignatureVerifier.verify("5:abc".toByteArray(), signature, keys.public.encoded))
    assertFalse(SignatureVerifier.verify(message, ByteArray(8), keys.public.encoded))
    assertFalse(SignatureVerifier.verify(message, signature, ByteArray(8)))
  }
}
