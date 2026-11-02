package com.betsblocker.vpn

// Pergunta DNS extraída de um datagrama IPv4/UDP vindo da interface TUN
class DnsQuery(
  val packet: ByteArray,
  val clientPort: Int,
  val serverPort: Int,
  val dnsOffset: Int,
  val dnsLength: Int,
  val questionLength: Int,
  val domain: String
) {
  val payload: ByteArray get() = packet.copyOfRange(dnsOffset, dnsOffset + dnsLength)
}

object DnsMessage {
  const val RCODE_SERVFAIL = 2
  const val RCODE_NXDOMAIN = 3
  private const val HEADER_LENGTH = 12
  private const val IP_UDP_HEADERS = 28
  private const val PROTOCOL_UDP = 17
  private const val DNS_PORT = 53

  /** Retorna null para tudo que não for uma consulta DNS IPv4/UDP bem formada. */
  fun parseQuery(packet: ByteArray, length: Int): DnsQuery? {
    if (length < IP_UDP_HEADERS) return null

    val versionAndIhl = packet[0].toInt() and 0xFF
    if (versionAndIhl shr 4 != 4) return null

    val ihl = (versionAndIhl and 0x0F) * 4
    if (ihl < 20 || length < ihl + 8) return null
    if ((packet[9].toInt() and 0xFF) != PROTOCOL_UDP) return null

    val clientPort = readShort(packet, ihl)
    val serverPort = readShort(packet, ihl + 2)
    if (serverPort != DNS_PORT) return null

    val dnsLength = readShort(packet, ihl + 4) - 8
    val dnsOffset = ihl + 8
    if (dnsLength < HEADER_LENGTH || dnsOffset + dnsLength > length) return null

    // Extrai o nome do domínio (QNAME) da pergunta DNS
    val domain = StringBuilder()
    var position = dnsOffset + HEADER_LENGTH
    val end = dnsOffset + dnsLength

    while (position < end) {
      val labelLength = packet[position].toInt() and 0xFF
      if (labelLength == 0) {
        position++
        break
      }
      if ((labelLength and 0xC0) == 0xC0) {
        position += 2
        break
      }
      position++
      if (position + labelLength > end) break
      if (domain.isNotEmpty()) domain.append('.')
      domain.append(String(packet, position, labelLength, Charsets.US_ASCII))
      position += labelLength
    }

    val questionEnd = position + 4
    val questionLength =
      if (questionEnd <= end) questionEnd - (dnsOffset + HEADER_LENGTH) else dnsLength - HEADER_LENGTH

    return DnsQuery(
      packet,
      clientPort,
      serverPort,
      dnsOffset,
      dnsLength,
      questionLength,
      domain.toString().lowercase().trim()
    )
  }

  fun errorResponse(query: DnsQuery, rcode: Int): ByteArray {
    val response = ByteArray(HEADER_LENGTH + query.questionLength)
    response[0] = query.packet[query.dnsOffset]
    response[1] = query.packet[query.dnsOffset + 1]
    response[2] = 0x81.toByte() // QR=1, RD=1
    response[3] = (0x80 or rcode).toByte() // RA=1
    response[5] = 1.toByte() // QDCOUNT = 1
    System.arraycopy(
      query.packet,
      query.dnsOffset + HEADER_LENGTH,
      response,
      HEADER_LENGTH,
      query.questionLength
    )
    return response
  }

  /** Confere o ID da transação: resposta atrasada de outro servidor não vale para esta pergunta. */
  fun isReplyTo(query: DnsQuery, reply: ByteArray, replyLength: Int): Boolean {
    return replyLength >= HEADER_LENGTH &&
      reply[0] == query.packet[query.dnsOffset] &&
      reply[1] == query.packet[query.dnsOffset + 1]
  }

  fun isTruncated(reply: ByteArray): Boolean {
    return reply.size >= HEADER_LENGTH && (reply[2].toInt() and 0x02) != 0
  }

  fun buildUdpResponse(query: DnsQuery, dnsPayload: ByteArray): ByteArray {
    val totalLength = IP_UDP_HEADERS + dnsPayload.size
    val response = ByteArray(totalLength)

    // Cabeçalho IPv4 (20 bytes)
    response[0] = 0x45.toByte() // Versão 4, IHL 5 (20 bytes)
    response[2] = (totalLength shr 8).toByte()
    response[3] = (totalLength and 0xFF).toByte()
    response[6] = 0x40.toByte() // Don't fragment
    response[8] = 64.toByte() // TTL padrão
    response[9] = PROTOCOL_UDP.toByte()

    // Inverte IPs (Origem vira Destino e vice-versa)
    System.arraycopy(query.packet, 16, response, 12, 4)
    System.arraycopy(query.packet, 12, response, 16, 4)

    val ipChecksum = ipChecksum(response, 20)
    response[10] = (ipChecksum shr 8).toByte()
    response[11] = (ipChecksum and 0xFF).toByte()

    // Cabeçalho UDP (8 bytes)
    val udpLength = 8 + dnsPayload.size
    response[20] = (query.serverPort shr 8).toByte()
    response[21] = (query.serverPort and 0xFF).toByte()
    response[22] = (query.clientPort shr 8).toByte()
    response[23] = (query.clientPort and 0xFF).toByte()
    response[24] = (udpLength shr 8).toByte()
    response[25] = (udpLength and 0xFF).toByte()

    System.arraycopy(dnsPayload, 0, response, IP_UDP_HEADERS, dnsPayload.size)

    val udpChecksum = udpChecksum(response, udpLength)
    response[26] = (udpChecksum shr 8).toByte()
    response[27] = (udpChecksum and 0xFF).toByte()
    return response
  }

  private fun readShort(buffer: ByteArray, offset: Int): Int {
    return ((buffer[offset].toInt() and 0xFF) shl 8) or (buffer[offset + 1].toInt() and 0xFF)
  }

  private fun foldChecksum(partialSum: Int): Int {
    var sum = partialSum
    while ((sum shr 16) > 0) {
      sum = (sum and 0xFFFF) + (sum shr 16)
    }
    return sum.inv() and 0xFFFF
  }

  private fun ipChecksum(buffer: ByteArray, length: Int): Int {
    var sum = 0
    var i = 0
    while (i < length - 1) {
      sum += readShort(buffer, i)
      i += 2
    }
    return foldChecksum(sum)
  }

  // Calculado com o campo de checksum ainda zerado, sobre o pseudo-cabeçalho IPv4 e o datagrama
  private fun udpChecksum(packet: ByteArray, udpLength: Int): Int {
    var sum = readShort(packet, 12) + readShort(packet, 14) + readShort(packet, 16) +
      readShort(packet, 18) + PROTOCOL_UDP + udpLength

    var i = 20
    val end = 20 + udpLength
    while (i < end - 1) {
      sum += readShort(packet, i)
      i += 2
    }
    if (i < end) {
      sum += (packet[i].toInt() and 0xFF) shl 8
    }
    val checksum = foldChecksum(sum)
    return if (checksum == 0) 0xFFFF else checksum
  }
}
