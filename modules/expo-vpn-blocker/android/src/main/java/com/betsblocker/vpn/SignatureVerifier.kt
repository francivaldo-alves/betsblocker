package com.betsblocker.vpn

import java.security.KeyFactory
import java.security.Signature
import java.security.spec.X509EncodedKeySpec

object SignatureVerifier {
  /** Valida uma assinatura ECDSA P-256/SHA-256 (DER); a chave pública vem em X.509/SPKI. */
  fun verify(message: ByteArray, signature: ByteArray, publicKey: ByteArray): Boolean {
    return try {
      val key = KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(publicKey))
      Signature.getInstance("SHA256withECDSA").run {
        initVerify(key)
        update(message)
        verify(signature)
      }
    } catch (_: Exception) {
      false
    }
  }
}
