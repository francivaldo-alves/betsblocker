package com.betsblocker.vpn

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.util.Log
import androidx.core.content.ContextCompat

// Religa a proteção após reiniciar o aparelho ou atualizar o app, se o usuário a deixou ativa
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) {
      return
    }
    if (!BetsBlockerVpnService.shouldRun(context)) return
    // Sem o consentimento da VPN (revogado ou outro app assumiu), só o usuário pode religar
    if (VpnService.prepare(context) != null) return

    try {
      ContextCompat.startForegroundService(
        context,
        Intent(context, BetsBlockerVpnService::class.java).apply {
          action = BetsBlockerVpnService.ACTION_START
        }
      )
    } catch (e: Exception) {
      Log.e("BetsBlockerBoot", "Falha ao religar a proteção: ${e.javaClass.simpleName}")
    }
  }
}
