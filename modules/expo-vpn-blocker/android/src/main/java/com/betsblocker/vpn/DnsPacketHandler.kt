package com.betsblocker.vpn

import android.net.VpnService
import android.util.Log
import java.io.OutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress

class DnsPacketHandler {

  companion object {
    private const val TAG = "BetsBlockerDNS"

    // Servidores DNS upstream de alta confiabilidade com fallback automático
    private val UPSTREAM_SERVERS = listOf(
      InetAddress.getByAddress(byteArrayOf(8, 8, 8, 8)),      // Google DNS Primário
      InetAddress.getByAddress(byteArrayOf(1, 1, 1, 1)),      // Cloudflare DNS Primário
      InetAddress.getByAddress(byteArrayOf(8, 8, 4, 4)),      // Google Secundário
      InetAddress.getByAddress(byteArrayOf(1, 0, 0, 1))       // Cloudflare Secundário
    )
  }

  private var blockedRules: Set<String> = emptySet()
  private var wildcardRules: List<String> = emptyList()

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
    if (protocol != 17) return // Protocolo 17 = UDP

    val srcPort = ((packet[ihl].toInt() and 0xFF) shl 8) or (packet[ihl + 1].toInt() and 0xFF)
    val dstPort = ((packet[ihl + 2].toInt() and 0xFF) shl 8) or (packet[ihl + 3].toInt() and 0xFF)

    // Apenas intercepta consultas DNS direcionadas à porta 53
    if (dstPort != 53) return

    val udpLen = ((packet[ihl + 4].toInt() and 0xFF) shl 8) or (packet[ihl + 5].toInt() and 0xFF)
    val dnsPayloadLen = udpLen - 8
    val dnsOffset = ihl + 8

    if (dnsPayloadLen < 12 || dnsOffset + dnsPayloadLen > length) return

    // Extrai o nome do domínio (QNAME) da pergunta DNS
    val domainSb = StringBuilder()
    var p = dnsOffset + 12
    val maxPos = dnsOffset + dnsPayloadLen

    while (p < maxPos) {
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
      if (p + labelLen > maxPos) break
      if (domainSb.isNotEmpty()) domainSb.append('.')
      domainSb.append(String(packet, p, labelLen, Charsets.US_ASCII))
      p += labelLen
    }

    val questionEnd = p + 4
    val questionLen = if (questionEnd <= maxPos) questionEnd - (dnsOffset + 12) else dnsPayloadLen - 12
    val requestedDomain = domainSb.toString().lowercase().trim()

    if (isDomainBlocked(requestedDomain)) {
      Log.i(TAG, "🚫 [BLOQUEIO ATIVO] $requestedDomain")
      // Responde imediatamente com NXDOMAIN (Código 3 - Domínio Inexistente)
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
      // Domínio permitido (ex: google.com, whatsapp.com): repassa ao DNS upstream com fallback resiliente
      val dnsQueryPayload = packet.copyOfRange(dnsOffset, dnsOffset + dnsPayloadLen)
      var replyBytes: ByteArray? = null

      var socket: DatagramSocket? = null
      try {
        socket = DatagramSocket(null)
        val protected = vpnService.protect(socket)
        if (!protected) {
          Log.w(TAG, "Aviso: vpnService.protect() retornou false")
        }
        socket.soTimeout = 1200
        socket.bind(InetSocketAddress(0))

        val inBuf = ByteArray(2048)
        val inPacket = DatagramPacket(inBuf, inBuf.size)

        for (upstream in UPSTREAM_SERVERS) {
          try {
            val outPacket = DatagramPacket(dnsQueryPayload, dnsQueryPayload.size, upstream, 53)
            socket.send(outPacket)
            socket.receive(inPacket)
            if (inPacket.length >= 12) {
              replyBytes = inBuf.copyOf(inPacket.length)
              break // Sucesso! Recebeu resposta válida
            }
          } catch (_: Exception) {
            // Tenta o próximo upstream da lista
          }
        }
      } catch (e: Exception) {
        Log.e(TAG, "Erro no socket UDP para $requestedDomain: ${e.message}")
      } finally {
        try {
          socket?.close()
        } catch (_: Exception) {}
      }

      if (replyBytes != null) {
        writeUdpResponse(packet, srcPort, dstPort, replyBytes, outputStream)
      } else {
        // Fallback: se nenhum upstream respondeu a tempo, envia SERVFAIL para liberar o cliente sem travar
        val failResp = ByteArray(12 + questionLen)
        failResp[0] = packet[dnsOffset]
        failResp[1] = packet[dnsOffset + 1]
        failResp[2] = 0x81.toByte()
        failResp[3] = 0x82.toByte() // RCODE=2 (SERVFAIL)
        failResp[4] = 0.toByte()
        failResp[5] = 1.toByte()
        System.arraycopy(packet, dnsOffset + 12, failResp, 12, questionLen)
        writeUdpResponse(packet, srcPort, dstPort, failResp, outputStream)
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

    // Cabeçalho IPv4 (20 bytes)
    resp[0] = 0x45.toByte() // Versão 4, IHL 5 (20 bytes)
    resp[1] = 0.toByte()
    resp[2] = (totalIpLen shr 8).toByte()
    resp[3] = (totalIpLen and 0xFF).toByte()
    resp[4] = 0.toByte()
    resp[5] = 0.toByte()
    resp[6] = 0x40.toByte() // Don't fragment
    resp[7] = 0.toByte()
    resp[8] = 64.toByte() // TTL padrão
    resp[9] = 17.toByte() // Protocolo 17 = UDP

    // Inverte IPs (Origem vira Destino e vice-versa)
    val srcIp = ByteArray(4)
    val dstIp = ByteArray(4)
    System.arraycopy(origPacket, 16, srcIp, 0, 4) // Antigo destino vira origem (10.111.222.1)
    System.arraycopy(origPacket, 12, dstIp, 0, 4) // Antiga origem vira destino (cliente)

    System.arraycopy(srcIp, 0, resp, 12, 4)
    System.arraycopy(dstIp, 0, resp, 16, 4)

    // Checksum do cabeçalho IPv4
    val ipChecksum = computeIpChecksum(resp, 0, 20)
    resp[10] = (ipChecksum.toInt() shr 8).toByte()
    resp[11] = (ipChecksum.toInt() and 0xFF).toByte()

    // Cabeçalho UDP (8 bytes)
    resp[20] = (serverPort shr 8).toByte() // Porta de origem: 53
    resp[21] = (serverPort and 0xFF).toByte()
    resp[22] = (clientPort shr 8).toByte() // Porta de destino: porta efêmera do cliente
    resp[23] = (clientPort and 0xFF).toByte()
    val udpLen = 8 + dnsPayload.size
    resp[24] = (udpLen shr 8).toByte()
    resp[25] = (udpLen and 0xFF).toByte()

    // Payload DNS
    System.arraycopy(dnsPayload, 0, resp, 28, dnsPayload.size)

    // Checksum UDP completo com pseudo-cabeçalho
    val udpChecksum = computeUdpChecksum(srcIp, dstIp, resp, 20, udpLen)
    resp[26] = (udpChecksum.toInt() shr 8).toByte()
    resp[27] = (udpChecksum.toInt() and 0xFF).toByte()

    synchronized(outputStream) {
      try {
        outputStream.write(resp)
        outputStream.flush()
      } catch (_: Exception) {}
    }
  }

  private fun computeIpChecksum(buf: ByteArray, offset: Int, length: Int): Short {
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

  private fun computeUdpChecksum(
    srcIp: ByteArray,
    dstIp: ByteArray,
    packet: ByteArray,
    udpOffset: Int,
    udpLen: Int
  ): Short {
    var sum = 0
    // Pseudo-cabeçalho IPv4
    sum += (((srcIp[0].toInt() and 0xFF) shl 8) or (srcIp[1].toInt() and 0xFF))
    sum += (((srcIp[2].toInt() and 0xFF) shl 8) or (srcIp[3].toInt() and 0xFF))
    sum += (((dstIp[0].toInt() and 0xFF) shl 8) or (dstIp[1].toInt() and 0xFF))
    sum += (((dstIp[2].toInt() and 0xFF) shl 8) or (dstIp[3].toInt() and 0xFF))
    sum += 17 // Protocolo UDP
    sum += udpLen

    // Cabeçalho UDP + Payload
    var i = udpOffset
    val end = udpOffset + udpLen
    while (i < end - 1) {
      if (i == udpOffset + 6) {
        i += 2 // Pula campo de checksum
        continue
      }
      val word = ((packet[i].toInt() and 0xFF) shl 8) or (packet[i + 1].toInt() and 0xFF)
      sum += word
      i += 2
    }
    if (i < end) {
      sum += ((packet[i].toInt() and 0xFF) shl 8)
    }
    while ((sum shr 16) > 0) {
      sum = (sum and 0xFFFF) + (sum shr 16)
    }
    val res = (sum.inv() and 0xFFFF)
    return if (res == 0) 0xFFFF.toShort() else res.toShort()
  }
}
