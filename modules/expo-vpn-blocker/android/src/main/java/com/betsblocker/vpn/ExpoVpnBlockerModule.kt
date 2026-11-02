package com.betsblocker.vpn

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.util.Base64
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoVpnBlockerModule : Module() {
  companion object {
    private const val VPN_REQUEST_CODE = 0x5650 // 'VP'
    private var pendingPermissionPromise: Promise? = null
  }

  private fun requireContext(promise: Promise): Context? {
    val context = appContext.reactContext ?: appContext.currentActivity
    if (context == null) {
      promise.reject("ERR_NO_CONTEXT", "Android Context não está disponível.", null)
    }
    return context
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

    AsyncFunction("hasVpnPermission") { promise: Promise ->
      val context = requireContext(promise) ?: return@AsyncFunction
      promise.resolve(VpnService.prepare(context) == null)
    }

    AsyncFunction("startVpn") { blockedDomains: List<String>, promise: Promise ->
      val context = requireContext(promise) ?: return@AsyncFunction

      BetsBlockerVpnService.setBlockedDomains(context, blockedDomains)
      BetsBlockerVpnService.setShouldRun(context, true)
      val intent = Intent(context, BetsBlockerVpnService::class.java).apply {
        action = BetsBlockerVpnService.ACTION_START
      }

      try {
        ContextCompat.startForegroundService(context, intent)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("ERR_START_VPN", e.message ?: "Falha ao iniciar VpnService", e)
      }
    }

    AsyncFunction("stopVpn") { promise: Promise ->
      val context = requireContext(promise) ?: return@AsyncFunction

      BetsBlockerVpnService.setShouldRun(context, false)
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

    AsyncFunction("getLastStartError") {
      BetsBlockerVpnService.lastStartError
    }

    AsyncFunction("updateRules") { blockedDomains: List<String>, promise: Promise ->
      val context = requireContext(promise) ?: return@AsyncFunction

      BetsBlockerVpnService.setBlockedDomains(context, blockedDomains)
      promise.resolve(true)
    }

    AsyncFunction("getRecentDomains") {
      BetsBlockerVpnService.getRecentDomains()
    }

    AsyncFunction("setFilterOptions") {
      blockAds: Boolean,
      exceptions: Map<String, Double>,
      auditOnly: Boolean,
      notifyBlocks: Boolean,
      promise: Promise ->
      val context = requireContext(promise) ?: return@AsyncFunction

      BetsBlockerVpnService.setFilterOptions(
        context,
        blockAds,
        exceptions.mapValues { it.value.toLong() },
        auditOnly,
        notifyBlocks
      )
      promise.resolve(true)
    }

    AsyncFunction("checkDomain") { domain: String ->
      DomainRules.classify(domain, BetsBlockerVpnService.getRules(), System.currentTimeMillis()).name
    }

    AsyncFunction("drainBlockEvents") { promise: Promise ->
      val context = requireContext(promise) ?: return@AsyncFunction
      promise.resolve(BlockEventLog.drain(context))
    }

    AsyncFunction("verifySignature") { message: String, signature: String, publicKey: String ->
      try {
        SignatureVerifier.verify(
          message.toByteArray(Charsets.UTF_8),
          Base64.decode(signature, Base64.DEFAULT),
          Base64.decode(publicKey, Base64.DEFAULT)
        )
      } catch (_: IllegalArgumentException) {
        false
      }
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
