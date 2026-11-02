package com.betsblocker.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.core.app.NotificationCompat
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class BetsBlockerVpnService : VpnService() {

  companion object {
    const val ACTION_START = "com.betsblocker.vpn.START"
    const val ACTION_STOP = "com.betsblocker.vpn.STOP"
    const val CHANNEL_ID = "bets_blocker_vpn_channel"
    const val NOTIFICATION_ID = 1001

    @Volatile
    var isRunning: Boolean = false
      private set

    private val activeBlockedRules = mutableSetOf<String>()
    private val activeWildcardRules = mutableListOf<String>()

    fun setBlockedDomains(domains: List<String>) {
      synchronized(this) {
        activeBlockedRules.clear()
        activeWildcardRules.clear()
        for (domain in domains) {
          val clean = domain.trim().lowercase()
          if (clean.startsWith("*.")) {
            activeWildcardRules.add(clean)
          } else {
            activeBlockedRules.add(clean)
          }
        }
      }
    }

    fun getRules(): Pair<Set<String>, List<String>> {
      synchronized(this) {
        return Pair(activeBlockedRules.toSet(), activeWildcardRules.toList())
      }
    }
  }

  private var vpnInterface: ParcelFileDescriptor? = null
  private val isThreadRunning = AtomicBoolean(false)
  private var workerThread: Thread? = null
  private var threadPool: ExecutorService? = null

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
    } catch (_: Exception) {}

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
      threadPool = Executors.newFixedThreadPool(16)

      workerThread = Thread({
        runVpnLoop()
      }, "BetsBlocker-VpnLoop").apply {
        start()
      }
    } catch (_: Exception) {
      stopVpn()
    }
  }

  private fun runVpnLoop() {
    val pfd = vpnInterface ?: return
    val inputStream = FileInputStream(pfd.fileDescriptor)
    val outputStream = FileOutputStream(pfd.fileDescriptor)
    val buffer = ByteArray(32767)

    val packetHandler = DnsPacketHandler()

    while (isThreadRunning.get()) {
      try {
        val length = inputStream.read(buffer)
        if (length > 0) {
          val packetCopy = buffer.copyOf(length)
          val (blocked, wildcards) = getRules()
          packetHandler.updateRules(blocked, wildcards)

          threadPool?.execute {
            try {
              packetHandler.handlePacket(packetCopy, length, this, outputStream)
            } catch (_: Exception) {}
          }
        }
      } catch (_: Exception) {
        break
      }
    }
  }

  private fun stopVpn() {
    isRunning = false
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
