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
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ExecutorService
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
    private const val PREF_EXCEPTIONS = "domain_exceptions"
    private const val PREF_AUDIT_ONLY = "audit_only"
    private const val PREF_NOTIFY_BLOCKS = "notify_blocks"
    private const val PREF_SHOULD_RUN = "should_run"
    private const val MAX_RECENT_DOMAINS = 200
    private const val MAX_QUEUED_PACKETS = 128

    @Volatile
    var isRunning: Boolean = false
      private set

    @Volatile
    var lastStartError: String? = null
      private set

    @Volatile
    private var activeRules = RuleSnapshot()

    // Mantido só em memória: revela os sites acessados, então nunca vai para o disco
    private val recentDomains = object : LinkedHashMap<String, Boolean>(MAX_RECENT_DOMAINS, 0.75f, true) {
      override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Boolean>): Boolean {
        return size > MAX_RECENT_DOMAINS
      }
    }

    fun recordRecentDomain(domain: String) {
      if (!domain.contains('.') || domain.endsWith(".arpa")) return
      synchronized(recentDomains) {
        recentDomains[domain] = true
      }
    }

    fun getRecentDomains(): List<String> {
      synchronized(recentDomains) {
        return recentDomains.keys.reversed()
      }
    }

    private fun clearRecentDomains() {
      synchronized(recentDomains) {
        recentDomains.clear()
      }
    }

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

        val prefs = prefs(context)
        applyFilterOptions(
          context,
          prefs.getBoolean(PREF_BLOCK_ADS, false),
          decodeExceptions(prefs.getStringSet(PREF_EXCEPTIONS, emptySet()) ?: emptySet()),
          prefs.getBoolean(PREF_AUDIT_ONLY, false),
          prefs.getBoolean(PREF_NOTIFY_BLOCKS, false)
        )
      }
    }

    fun setFilterOptions(
      context: Context,
      blockAds: Boolean,
      exceptions: Map<String, Long>,
      auditOnly: Boolean,
      notifyBlocks: Boolean
    ) {
      synchronized(this) {
        val normalized = exceptions.mapKeys { it.key.trim().lowercase().removePrefix("*.") }
        prefs(context).edit()
          .putBoolean(PREF_BLOCK_ADS, blockAds)
          .putStringSet(PREF_EXCEPTIONS, normalized.map { "${it.key}|${it.value}" }.toSet())
          .putBoolean(PREF_AUDIT_ONLY, auditOnly)
          .putBoolean(PREF_NOTIFY_BLOCKS, notifyBlocks)
          .apply()
        applyFilterOptions(context, blockAds, normalized, auditOnly, notifyBlocks)
      }
    }

    private fun decodeExceptions(encoded: Set<String>): Map<String, Long> {
      return encoded.associate { entry ->
        val separator = entry.lastIndexOf('|')
        entry.substring(0, separator) to entry.substring(separator + 1).toLong()
      }
    }

    private fun applyFilterOptions(
      context: Context,
      blockAds: Boolean,
      exceptions: Map<String, Long>,
      auditOnly: Boolean,
      notifyBlocks: Boolean
    ) {
      // A lista de anúncios só ocupa memória enquanto a VPN está de pé
      val adsTrackers = when {
        !blockAds || !isRunning -> null
        else -> activeRules.adsTrackers ?: loadAdsTrackers(context)
      }
      BlockEventLog.notificationsEnabled = notifyBlocks
      activeRules = activeRules.copy(
        exceptions = exceptions,
        adsTrackers = adsTrackers,
        auditOnly = auditOnly
      )
    }

    private fun loadAdsTrackers(context: Context): SortedDomainSet? {
      return try {
        SortedDomainSet.fromBytes(context.assets.open(ADS_TRACKERS_ASSET).use { it.readBytes() })
      } catch (e: Exception) {
        Log.e(TAG, "Falha ao carregar lista de anúncios: ${e.message}")
        null
      }
    }

    private fun releaseAdsTrackers() {
      synchronized(this) {
        activeRules = activeRules.copy(adsTrackers = null)
      }
    }

    private fun applyRules(domains: List<String>) {
      val (wildcards, blocked) = domains.map { it.trim().lowercase() }.partition { it.startsWith("*.") }
      activeRules = activeRules.copy(blocked = blocked.toHashSet(), wildcards = wildcards)
    }

    fun getRules(): RuleSnapshot = activeRules

    private fun prefs(context: Context) =
      context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun setShouldRun(context: Context, shouldRun: Boolean) {
      prefs(context).edit().putBoolean(PREF_SHOULD_RUN, shouldRun).apply()
    }

    fun shouldRun(context: Context): Boolean = prefs(context).getBoolean(PREF_SHOULD_RUN, false)
  }

  private var vpnInterface: ParcelFileDescriptor? = null
  private val isThreadRunning = AtomicBoolean(false)
  private var workerThread: Thread? = null
  private var threadPool: ExecutorService? = null
  private val packetHandler = DnsPacketHandler(::getRules)
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
    if (intent?.action == ACTION_STOP) {
      stopVpn()
      return START_NOT_STICKY
    }

    // ACTION_START, recriação pelo sistema (null) ou VPN sempre ativa (android.net.VpnService)
    startVpn()
    return if (isRunning) START_STICKY else START_NOT_STICKY
  }

  private fun startVpn() {
    // Antes de tudo: startForegroundService exige esta chamada mesmo com a VPN já de pé
    try {
      startForeground(NOTIFICATION_ID, buildNotification())
    } catch (e: Exception) {
      Log.e(TAG, "Falha ao entrar em primeiro plano: ${e.message}")
    }

    if (isRunning) return
    lastStartError = null

    try {
      val builder = Builder().apply {
        setSession("BetsBlocker")
        setMtu(1500)
        // Sem isto, o Android trataria toda rede como tarifada enquanto a VPN estiver ativa
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          setMetered(false)
        }
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
        lastStartError = "O Android não autorizou a VPN do BetsBlocker."
        stopVpn()
        return
      }

      isRunning = true
      isThreadRunning.set(true)
      // Threads ociosas são encerradas: o tráfego DNS chega em rajadas curtas.
      // Sem rede, as consultas mais antigas são descartadas: quem perguntou já desistiu delas
      threadPool = ThreadPoolExecutor(
        16,
        16,
        30L,
        TimeUnit.SECONDS,
        ArrayBlockingQueue(MAX_QUEUED_PACKETS),
        ThreadPoolExecutor.DiscardOldestPolicy()
      ).apply { allowCoreThreadTimeOut(true) }
      registerNetworkCallback()

      workerThread = Thread({
        runVpnLoop()
      }, "BetsBlocker-VpnLoop").apply {
        start()
      }
    } catch (e: Exception) {
      Log.e(TAG, "Falha ao iniciar a VPN: ${e.message}")
      lastStartError = e.message ?: "Falha ao iniciar a VPN."
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
    clearRecentDomains()
    releaseAdsTrackers()
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
