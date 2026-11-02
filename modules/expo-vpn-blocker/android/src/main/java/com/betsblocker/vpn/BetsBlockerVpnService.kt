package com.betsblocker.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log
import androidx.core.app.NotificationCompat
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.concurrent.ExecutorService
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class BetsBlockerVpnService : VpnService() {

  companion object {
    const val ACTION_START = "com.betsblocker.vpn.START"
    const val ACTION_STOP = "com.betsblocker.vpn.STOP"
    const val CHANNEL_ID = "bets_blocker_vpn_channel"
    const val NOTIFICATION_ID = 1001
    private const val TAG = "BetsBlockerVpn"
    private const val RULES_FILE = "vpn-blocked-rules.txt"
    private const val ADS_TRACKERS_ASSET = "ads-trackers.txt"
    private const val PREFS_NAME = "vpn_blocker"
    private const val PREF_BLOCK_ADS = "block_ads"
    private const val PREF_ALLOWED_DOMAINS = "allowed_domains"

    @Volatile
    var isRunning: Boolean = false
      private set

    @Volatile
    private var activeRules = RuleSnapshot()

    fun setBlockedDomains(context: Context, domains: List<String>) {
      synchronized(this) {
        applyRules(domains)
        try {
          val tempFile = File(context.filesDir, "$RULES_FILE.tmp")
          tempFile.writeText(domains.joinToString("\n"))
          if (!tempFile.renameTo(File(context.filesDir, RULES_FILE))) {
            Log.e(TAG, "Falha ao substituir o arquivo de regras")
          }
        } catch (e: Exception) {
          Log.e(TAG, "Falha ao salvar regras: ${e.message}")
        }
      }
    }

    // O serviço pode ser recriado pelo sistema (START_STICKY) sem passar pelo JS
    private fun restoreRulesIfNeeded(context: Context) {
      synchronized(this) {
        if (activeRules.blocked.isEmpty() && activeRules.wildcards.isEmpty()) {
          try {
            val file = File(context.filesDir, RULES_FILE)
            if (file.exists()) {
              applyRules(file.readLines().filter { it.isNotBlank() })
            }
          } catch (e: Exception) {
            Log.e(TAG, "Falha ao restaurar regras: ${e.message}")
          }
        }

        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        applyAdBlocking(
          context,
          prefs.getBoolean(PREF_BLOCK_ADS, false),
          prefs.getStringSet(PREF_ALLOWED_DOMAINS, emptySet()) ?: emptySet()
        )
      }
    }

    fun setAdBlocking(context: Context, enabled: Boolean, allowedDomains: List<String>) {
      synchronized(this) {
        val allowed = allowedDomains.map { it.trim().lowercase() }.toSet()
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
          .putBoolean(PREF_BLOCK_ADS, enabled)
          .putStringSet(PREF_ALLOWED_DOMAINS, allowed)
          .apply()
        applyAdBlocking(context, enabled, allowed)
      }
    }

    private fun applyAdBlocking(context: Context, enabled: Boolean, allowed: Set<String>) {
      val adsTrackers = when {
        !enabled -> emptySet()
        activeRules.adsTrackers.isNotEmpty() -> activeRules.adsTrackers
        else -> loadAdsTrackers(context)
      }
      activeRules = activeRules.copy(allowed = allowed, adsTrackers = adsTrackers)
    }

    private fun loadAdsTrackers(context: Context): Set<String> {
      return try {
        context.assets.open(ADS_TRACKERS_ASSET).bufferedReader().useLines { lines ->
          lines.filter { it.isNotBlank() && !it.startsWith("#") }.toHashSet()
        }
      } catch (e: Exception) {
        Log.e(TAG, "Falha ao carregar lista de anúncios: ${e.message}")
        emptySet()
      }
    }

    private fun applyRules(domains: List<String>) {
      val (wildcards, blocked) = domains.map { it.trim().lowercase() }.partition { it.startsWith("*.") }
      activeRules = activeRules.copy(blocked = blocked.toHashSet(), wildcards = wildcards)
    }

    fun getRules(): RuleSnapshot = activeRules
  }

  private var vpnInterface: ParcelFileDescriptor? = null
  private val isThreadRunning = AtomicBoolean(false)
  private var workerThread: Thread? = null
  private var threadPool: ExecutorService? = null
  private val packetHandler = DnsPacketHandler()
  private var isNetworkCallbackRegistered = false

  // Os servidores DNS só mudam com a rede, então não é preciso consultá-los a cada pergunta
  private val networkCallback = object : ConnectivityManager.NetworkCallback() {
    override fun onAvailable(network: Network) {
      packetHandler.invalidateUpstreams()
    }

    override fun onLinkPropertiesChanged(network: Network, linkProperties: LinkProperties) {
      packetHandler.invalidateUpstreams()
    }

    override fun onLost(network: Network) {
      packetHandler.invalidateUpstreams()
    }
  }

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopVpn()
        return START_NOT_STICKY
      }
      ACTION_START, null -> {
        startVpn()
        return START_STICKY
      }
    }
    return START_NOT_STICKY
  }

  private fun startVpn() {
    if (isRunning) return

    try {
      startForeground(NOTIFICATION_ID, buildNotification())
    } catch (e: Exception) {
      Log.e(TAG, "Falha ao entrar em primeiro plano: ${e.message}")
    }

    try {
      val builder = Builder().apply {
        setSession("BetsBlocker")
        setMtu(1500)
        // Endereço local da interface virtual (Cliente no subnet /24)
        addAddress("10.111.222.1", 24)
        // Define o DNS do sistema para o gateway virtual dedicado no mesmo subnet
        addDnsServer("10.111.222.2")
        // Roteia exclusivamente as consultas DNS direcionadas a 10.111.222.2 para a TUN
        addRoute("10.111.222.2", 32)
        try {
          addDisallowedApplication(packageName)
        } catch (_: Exception) {}
        setBlocking(true)
      }

      vpnInterface = builder.establish()
      if (vpnInterface == null) {
        stopSelf()
        return
      }

      isRunning = true
      isThreadRunning.set(true)
      // Threads ociosas são encerradas: o tráfego DNS chega em rajadas curtas
      threadPool = ThreadPoolExecutor(
        16, 16, 30L, TimeUnit.SECONDS, LinkedBlockingQueue()
      ).apply { allowCoreThreadTimeOut(true) }
      registerNetworkCallback()

      workerThread = Thread({
        runVpnLoop()
      }, "BetsBlocker-VpnLoop").apply {
        start()
      }
    } catch (e: Exception) {
      Log.e(TAG, "Falha ao iniciar a VPN: ${e.message}")
      stopVpn()
    }
  }

  private fun runVpnLoop() {
    val pfd = vpnInterface ?: return
    val inputStream = FileInputStream(pfd.fileDescriptor)
    val outputStream = FileOutputStream(pfd.fileDescriptor)
    val buffer = ByteArray(32767)

    // Fora da thread principal: a lista de anúncios leva alguns instantes para carregar
    restoreRulesIfNeeded(this)

    while (isThreadRunning.get()) {
      try {
        val length = inputStream.read(buffer)
        if (length < 0) break
        if (length > 0) {
          val packetCopy = buffer.copyOf(length)
          packetHandler.updateRules(getRules())

          threadPool?.execute {
            try {
              packetHandler.handlePacket(packetCopy, length, this, outputStream)
            } catch (_: Exception) {}
          }
        }
      } catch (e: Exception) {
        Log.w(TAG, "Leitura da interface VPN interrompida: ${e.message}")
        break
      }
    }

    // Sem leitor, a interface ativa deixaria todo o DNS do aparelho sem resposta
    if (isThreadRunning.get()) {
      Log.e(TAG, "Loop da VPN encerrado inesperadamente; desligando a VPN")
      stopVpn()
    }
  }

  private fun registerNetworkCallback() {
    try {
      val manager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      manager.registerDefaultNetworkCallback(networkCallback)
      isNetworkCallbackRegistered = true
    } catch (e: Exception) {
      Log.e(TAG, "Falha ao monitorar a rede: ${e.message}")
    }
  }

  private fun unregisterNetworkCallback() {
    if (!isNetworkCallbackRegistered) return
    isNetworkCallbackRegistered = false
    try {
      val manager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      manager.unregisterNetworkCallback(networkCallback)
    } catch (_: Exception) {}
  }

  private fun stopVpn() {
    isRunning = false
    unregisterNetworkCallback()
    isThreadRunning.set(false)
    workerThread?.interrupt()
    workerThread = null
    threadPool?.shutdownNow()
    threadPool = null

    try {
      vpnInterface?.close()
    } catch (_: Exception) {}
    vpnInterface = null

    try {
      stopForeground(true)
    } catch (_: Exception) {}

    stopSelf()
  }

  override fun onDestroy() {
    stopVpn()
    super.onDestroy()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "BetsBlocker Proteção Ativa",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Monitoramento e bloqueio local de sites de apostas"
        setShowBadge(false)
      }
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
      manager?.createNotificationChannel(channel)
    }
  }

  private fun buildNotification(): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pendingIntent = PendingIntent.getActivity(
      this,
      0,
      launchIntent,
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    )

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("BetsBlocker Ativo")
      .setContentText("Filtragem local de apostas em execução")
      .setSmallIcon(android.R.drawable.ic_lock_lock)
      .setContentIntent(pendingIntent)
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
  }
}
