package com.betsblocker.vpn

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoVpnBlockerModule : Module() {
  companion object {
    private const val VPN_REQUEST_CODE = 0x5650 // 'VP'
    private var pendingPermissionPromise: Promise? = null
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoVpnBlocker")

    Function("isAvailable") {
      true
    }

    AsyncFunction("requestVpnPermission") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(false)
        return@AsyncFunction
      }

      val intent = VpnService.prepare(activity)
      if (intent == null) {
        // A permissão já foi concedida anteriormente pelo usuário
        promise.resolve(true)
      } else {
        pendingPermissionPromise = promise
        try {
          activity.startActivityForResult(intent, VPN_REQUEST_CODE)
        } catch (_: Exception) {
          pendingPermissionPromise = null
          promise.resolve(false)
        }
      }
    }

    AsyncFunction("startVpn") { blockedDomains: List<String>, promise: Promise ->
      val context = appContext.reactContext ?: appContext.currentActivity
      if (context == null) {
        promise.reject("ERR_NO_CONTEXT", "Android Context não está disponível.", null)
        return@AsyncFunction
      }

      BetsBlockerVpnService.setBlockedDomains(blockedDomains)
      val intent = Intent(context, BetsBlockerVpnService::class.java).apply {
        action = BetsBlockerVpnService.ACTION_START
      }

      try {
        context.startService(intent)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("ERR_START_VPN", e.message ?: "Falha ao iniciar VpnService", e)
      }
    }

    AsyncFunction("stopVpn") { promise: Promise ->
      val context = appContext.reactContext ?: appContext.currentActivity
      if (context == null) {
        promise.reject("ERR_NO_CONTEXT", "Android Context não está disponível.", null)
        return@AsyncFunction
      }

      val intent = Intent(context, BetsBlockerVpnService::class.java).apply {
        action = BetsBlockerVpnService.ACTION_STOP
      }

      try {
        context.startService(intent)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("ERR_STOP_VPN", e.message ?: "Falha ao parar VpnService", e)
      }
    }

    AsyncFunction("isVpnRunning") {
      BetsBlockerVpnService.isRunning
    }

    AsyncFunction("updateRules") { blockedDomains: List<String>, promise: Promise ->
      BetsBlockerVpnService.setBlockedDomains(blockedDomains)
      promise.resolve(true)
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode == VPN_REQUEST_CODE) {
        val granted = payload.resultCode == Activity.RESULT_OK
        pendingPermissionPromise?.resolve(granted)
        pendingPermissionPromise = null
      }
    }
  }
}
