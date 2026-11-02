package com.betsblocker.vpn

import android.content.Context
import android.net.ConnectivityManager
import android.net.VpnService
import android.util.Log
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.OutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket

class DnsPacketHandler(private val rules: () -> RuleSnapshot) {

  companion object {
    private const val TAG = "BetsBlockerDNS"
    private const val UPSTREAM_TIMEOUT_MS = 1000
    private const val MAX_UDP_REPLY = 4096
    // MTU da interface menos os cabeçalhos IPv4 e UDP
    private const val MAX_TUN_PAYLOAD = 1472

    // Lista estática de fallbacks públicos universais
    private val DEFAULT_FALLBACKS = listOf(
      InetAddress.getByAddress(byteArrayOf(8, 8, 8, 8)), // Google DNS
      InetAddress.getByAddress(byteArrayOf(1, 1, 1, 1)), // Cloudflare DNS
      InetAddress.getByAddress(byteArrayOf(8, 8, 4, 4))  // Google Secundário
    )
  }

  @Volatile
  private var cachedUpstreams: List<InetAddress>? = null

  fun invalidateUpstreams() {
    cachedUpstreams = null
  }

  /**
   * Obtém os servidores DNS reais da conexão ativa (Wi-Fi ou Dados Móveis)
   */
  private fun getUpstreamServers(context: Context): List<InetAddress> {
    cachedUpstreams?.let { return it }

    val servers = mutableListOf<InetAddress>()
    try {
      val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
      val activeNetwork = cm?.activeNetwork
      val linkProperties = if (activeNetwork != null) cm.getLinkProperties(activeNetwork) else null
      linkProperties?.dnsServers?.let { dnsList ->
        for (dns in dnsList) {
          if (dns is Inet4Address) {
            servers.add(dns)
          }
        }
      }
    } catch (_: Exception) {}

    servers.addAll(DEFAULT_FALLBACKS)
    return servers.distinct().also { cachedUpstreams = it }
  }

  fun handlePacket(
    packet: ByteArray,
    length: Int,
    vpnService: VpnService,
    outputStream: OutputStream
  ) {
    val query = DnsMessage.parseQuery(packet, length) ?: return
    val snapshot = rules()
    val decision = DomainRules.classify(query.domain, snapshot, System.currentTimeMillis())

    if (decision == DomainDecision.GAMBLING) {
      BlockEventLog.record(vpnService, query.domain, snapshot.auditOnly)
    }

    if (decision != DomainDecision.ALLOW && !snapshot.auditOnly) {
      // Ligar em testes: adb shell setprop log.tag.BetsBlockerDNS DEBUG
      if (Log.isLoggable(TAG, Log.DEBUG)) {
        Log.d(TAG, "[BLOQUEIO] ${query.domain}")
      }
      write(query, DnsMessage.errorResponse(query, DnsMessage.RCODE_NXDOMAIN), outputStream)
      return
    }

    if (decision == DomainDecision.ALLOW) {
      BetsBlockerVpnService.recordRecentDomain(query.domain)
    }

    val reply = forward(query, vpnService)
    if (reply != null) {
      write(query, reply, outputStream)
    } else {
      // Fallback rápido se sem conexão
      Log.w(TAG, "SERVFAIL: nenhum upstream respondeu")
      invalidateUpstreams()
      write(query, DnsMessage.errorResponse(query, DnsMessage.RCODE_SERVFAIL), outputStream)
    }
  }

  private fun forward(query: DnsQuery, vpnService: VpnService): ByteArray? {
    val payload = query.payload
    var socket: DatagramSocket? = null

    try {
      socket = DatagramSocket(null)
      if (!vpnService.protect(socket)) {
        Log.w(TAG, "protect() recusado para o socket de encaminhamento")
      }
      socket.soTimeout = UPSTREAM_TIMEOUT_MS
      socket.bind(InetSocketAddress(0))

      val inBuf = ByteArray(MAX_UDP_REPLY)
      val inPacket = DatagramPacket(inBuf, inBuf.size)

      for (upstream in getUpstreamServers(vpnService)) {
        try {
          socket.send(DatagramPacket(payload, payload.size, upstream, 53))
          socket.receive(inPacket)
          if (inPacket.address != upstream) continue
          if (!DnsMessage.isReplyTo(query, inBuf, inPacket.length)) continue

          val reply = inBuf.copyOf(inPacket.length)
          if (!DnsMessage.isTruncated(reply)) return reply
          return forwardOverTcp(query, payload, upstream, vpnService) ?: reply
        } catch (e: Exception) {
          // Tenta o próximo DNS upstream da lista
          Log.w(TAG, "Upstream ${upstream.hostAddress} falhou: ${e.javaClass.simpleName}")
        }
      }
    } catch (e: Exception) {
      Log.e(TAG, "Erro ao encaminhar consulta: ${e.javaClass.simpleName}")
    } finally {
      try {
        socket?.close()
      } catch (_: Exception) {}
    }
    return null
  }

  /**
   * A interface TUN só atende UDP, então o cliente não consegue repetir a consulta por TCP.
   * Ao receber TC=1, a repetição é feita aqui e a resposta completa volta por UDP.
   */
  private fun forwardOverTcp(
    query: DnsQuery,
    payload: ByteArray,
    upstream: InetAddress,
    vpnService: VpnService
  ): ByteArray? {
    return try {
      Socket().use { socket ->
        vpnService.protect(socket)
        socket.soTimeout = UPSTREAM_TIMEOUT_MS
        socket.connect(InetSocketAddress(upstream, 53), UPSTREAM_TIMEOUT_MS)

        val output = DataOutputStream(socket.getOutputStream())
        output.writeShort(payload.size)
        output.write(payload)
        output.flush()

        val input = DataInputStream(socket.getInputStream())
        val length = input.readUnsignedShort()
        if (length > MAX_TUN_PAYLOAD) return null

        val reply = ByteArray(length)
        input.readFully(reply)
        if (DnsMessage.isReplyTo(query, reply, length)) reply else null
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun write(query: DnsQuery, dnsPayload: ByteArray, outputStream: OutputStream) {
    val response = DnsMessage.buildUdpResponse(query, dnsPayload)
    synchronized(outputStream) {
      try {
        outputStream.write(response)
        outputStream.flush()
      } catch (_: Exception) {}
    }
  }
}
