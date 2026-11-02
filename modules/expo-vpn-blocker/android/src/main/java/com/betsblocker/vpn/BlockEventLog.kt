package com.betsblocker.vpn

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.io.File

/**
 * Fila em disco dos bloqueios de apostas. A VPN roda com o app fechado, então os eventos
 * ficam aqui até o JS levá-los para o SQLite. Domínios permitidos e anúncios nunca entram.
 */
object BlockEventLog {
  private const val TAG = "BetsBlockerEvents"
  private const val FILE_NAME = "vpn-block-events.log"
  private const val MAX_FILE_BYTES = 256 * 1024L
  private const val MAX_TRACKED_DOMAINS = 256
  // O sistema repete a mesma consulta várias vezes: uma tentativa de acesso vira um evento só
  private const val REPEAT_WINDOW_MS = 60_000L
  private const val NOTIFICATION_INTERVAL_MS = 5 * 60_000L
  private const val ALERT_CHANNEL_ID = "bets_blocker_alerts"
  private const val ALERT_NOTIFICATION_ID = 1002

  @Volatile
  var notificationsEnabled = false

  private var lastNotificationAt = 0L
  private val lastSeen = object : LinkedHashMap<String, Long>(MAX_TRACKED_DOMAINS, 0.75f, true) {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Long>): Boolean {
      return size > MAX_TRACKED_DOMAINS
    }
  }

  fun record(context: Context, domain: String, audited: Boolean) {
    val now = System.currentTimeMillis()
    synchronized(this) {
      val previous = lastSeen[domain]
      if (previous != null && now - previous < REPEAT_WINDOW_MS) return
      lastSeen[domain] = now

      try {
        val file = File(context.filesDir, FILE_NAME)
        if (file.length() < MAX_FILE_BYTES) {
          file.appendText("$now\t$domain\t${if (audited) 1 else 0}\n")
        }
      } catch (e: Exception) {
        Log.w(TAG, "Falha ao registrar bloqueio: ${e.javaClass.simpleName}")
      }

      if (!audited && notificationsEnabled && now - lastNotificationAt >= NOTIFICATION_INTERVAL_MS) {
        lastNotificationAt = now
        notifyBlock(context, domain)
      }
    }
  }

  fun drain(context: Context): List<Map<String, Any>> {
    synchronized(this) {
      val file = File(context.filesDir, FILE_NAME)
      if (!file.exists()) return emptyList()

      val events = try {
        file.readLines().mapNotNull(::parseLine)
      } catch (e: Exception) {
        Log.w(TAG, "Falha ao ler bloqueios: ${e.javaClass.simpleName}")
        return emptyList()
      }
      file.delete()
      return events
    }
  }

  private fun parseLine(line: String): Map<String, Any>? {
    val fields = line.split('\t')
    if (fields.size != 3) return null
    val blockedAt = fields[0].toDoubleOrNull() ?: return null
    return mapOf("blockedAt" to blockedAt, "domain" to fields[1], "audited" to (fields[2] == "1"))
  }

  private fun notifyBlock(context: Context, domain: String) {
    val manager = NotificationManagerCompat.from(context)
    if (!manager.areNotificationsEnabled()) return

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(ALERT_CHANNEL_ID, "Bloqueios de apostas", NotificationManager.IMPORTANCE_DEFAULT)
      )
    }

    val notification = NotificationCompat.Builder(context, ALERT_CHANNEL_ID)
      .setContentTitle("Acesso bloqueado")
      .setContentText("O BetsBlocker bloqueou $domain")
      .setSmallIcon(android.R.drawable.ic_lock_lock)
      .setAutoCancel(true)
      .build()

    try {
      manager.notify(ALERT_NOTIFICATION_ID, notification)
    } catch (_: SecurityException) {}
  }
}
