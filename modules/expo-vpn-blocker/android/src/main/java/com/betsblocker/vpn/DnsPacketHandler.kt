package com.betsblocker.vpn

import android.net.VpnService
import java.io.OutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress

class DnsPacketHandler {

  private var blockedRules: Set<String> = emptySet()
  private var wildcardRules: List<String> = emptyList()
  private val upstreamDns = "1.1.1.1"

  fun updateRules(blocked: Set<String>, wildcards: List<String>) {
    this.blockedRules = blocked
    this.wildcardRules = wildcards
  }

  fun isDomainBlocked(domain: String): Boolean {
    if (domain.isEmpty()) return false
    val clean = domain.trim().lowercase()

    if (blockedRules.contains(clean)) return true

    for (wildcard in wildcardRules) {
      val suffix = wildcard.removePrefix("*.")
      if (clean == suffix || clean.endsWith(".$suffix")) {
        return true
      }
    }
    return false
  }

  fun handlePacket(
    packet: ByteArray,
    length: Int,
    vpnService: VpnService,
    outputStream: OutputStream
  ) {
    if (length < 28) return

    val versionAndIhl = packet[0].toInt() and 0xFF
    val version = versionAndIhl shr 4
    if (version != 4) return

    val ihl = (versionAndIhl and 0x0F) * 4
    if (length < ihl + 8) return

    val protocol = packet[9].toInt() and 0xFF
    if (protocol != 17) return // Protocol 17 = UDP

    val srcPort = ((packet[ihl].toInt() and 0xFF) shl 8) or (packet[ihl + 1].toInt() and 0xFF)
    val dstPort = ((packet[ihl + 2].toInt() and 0xFF) shl 8) or (packet[ihl + 3].toInt() and 0xFF)

    // Apenas intercepta consultas DNS (porta 53)
    if (dstPort != 53) return

    val dnsOffset = ihl + 8
    val dnsLen = length - dnsOffset
    if (dnsLen < 12) return

    // Extrai o QNAME da pergunta DNS
    val domainSb = StringBuilder()
    var p = dnsOffset + 12
    while (p < length) {
      val labelLen = packet[p].toInt() and 0xFF
      if (labelLen == 0) {
        p++
        break
      }
      if ((labelLen and 0xC0) == 0xC0) {
        p += 2
        break
      }
      p++
      if (p + labelLen > length) break
      if (domainSb.isNotEmpty()) domainSb.append('.')
      domainSb.append(String(packet, p, labelLen, Charsets.US_ASCII))
      p += labelLen
    }

    val questionEnd = p + 4
    if (questionEnd > length) return
    val questionLen = questionEnd - (dnsOffset + 12)
    val requestedDomain = domainSb.toString().lowercase().trim()

    if (isDomainBlocked(requestedDomain)) {
      // Bloqueia com NXDOMAIN instantâneo
      val dnsResp = ByteArray(12 + questionLen)
      dnsResp[0] = packet[dnsOffset]
      dnsResp[1] = packet[dnsOffset + 1]
      dnsResp[2] = 0x81.toByte() // QR=1, RD=1
      dnsResp[3] = 0x83.toByte() // RA=1, RCODE=3 (NXDOMAIN)
      dnsResp[4] = 0.toByte()
      dnsResp[5] = 1.toByte() // QDCOUNT = 1
      dnsResp[6] = 0.toByte()
      dnsResp[7] = 0.toByte() // ANCOUNT = 0
      dnsResp[8] = 0.toByte()
      dnsResp[9] = 0.toByte()
      dnsResp[10] = 0.toByte()
      dnsResp[11] = 0.toByte()
      System.arraycopy(packet, dnsOffset + 12, dnsResp, 12, questionLen)

      writeUdpResponse(packet, srcPort, dstPort, dnsResp, outputStream)
    } else {
      // Encaminha requisição ao DNS oficial upstream (Cloudflare 1.1.1.1)
      try {
        val socket = DatagramSocket()
        vpnService.protect(socket) // Garante que a requisição sai pela conexão real
        socket.soTimeout = 2000

        val dnsPayload = packet.copyOfRange(dnsOffset, dnsOffset + dnsLen)
        val upstreamAddr = InetAddress.getByName(upstreamDns)
        val outPacket = DatagramPacket(dnsPayload, dnsPayload.size, upstreamAddr, 53)
        socket.send(outPacket)

        val inBuf = ByteArray(2048)
        val inPacket = DatagramPacket(inBuf, inBuf.size)
        socket.receive(inPacket)
        socket.close()

        val replyDns = inBuf.copyOf(inPacket.length)
        writeUdpResponse(packet, srcPort, dstPort, replyDns, outputStream)
      } catch (_: Exception) {
        // Ignora timeout de pacote individual
      }
    }
  }

  private fun writeUdpResponse(
    origPacket: ByteArray,
    clientPort: Int,
    serverPort: Int,
    dnsPayload: ByteArray,
    outputStream: OutputStream
  ) {
    val totalIpLen = 20 + 8 + dnsPayload.size
    val resp = ByteArray(totalIpLen)

    // Cabeçalho IPv4
    resp[0] = 0x45.toByte()
    resp[1] = 0.toByte()
    resp[2] = (totalIpLen shr 8).toByte()
    resp[3] = (totalIpLen and 0xFF).toByte()
    resp[4] = 0.toByte()
    resp[5] = 0.toByte()
    resp[6] = 0x40.toByte()
    resp[7] = 0.toByte()
    resp[8] = 64.toByte()
    resp[9] = 17.toByte() // UDP

    // Inverte IPs (Origem vira Destino)
    System.arraycopy(origPacket, 16, resp, 12, 4)
    System.arraycopy(origPacket, 12, resp, 16, 4)

    val checksum = computeChecksum(resp, 0, 20)
    resp[10] = (checksum.toInt() shr 8).toByte()
    resp[11] = (checksum.toInt() and 0xFF).toByte()

    // Cabeçalho UDP
    resp[20] = (serverPort shr 8).toByte()
    resp[21] = (serverPort and 0xFF).toByte()
    resp[22] = (clientPort shr 8).toByte()
    resp[23] = (clientPort and 0xFF).toByte()
    val udpLen = 8 + dnsPayload.size
    resp[24] = (udpLen shr 8).toByte()
    resp[25] = (udpLen and 0xFF).toByte()
    resp[26] = 0.toByte()
    resp[27] = 0.toByte()

    // Payload DNS
    System.arraycopy(dnsPayload, 0, resp, 28, dnsPayload.size)

    synchronized(outputStream) {
      try {
        outputStream.write(resp)
        outputStream.flush()
      } catch (_: Exception) {}
    }
  }

  private fun computeChecksum(buf: ByteArray, offset: Int, length: Int): Short {
    var sum = 0
    var i = offset
    while (i < offset + length - 1) {
      if (i == offset + 10) {
        i += 2
        continue
      }
      val word = ((buf[i].toInt() and 0xFF) shl 8) or (buf[i + 1].toInt() and 0xFF)
      sum += word
      i += 2
    }
    while ((sum shr 16) > 0) {
      sum = (sum and 0xFFFF) + (sum shr 16)
    }
    return (sum.inv() and 0xFFFF).toShort()
  }
}
