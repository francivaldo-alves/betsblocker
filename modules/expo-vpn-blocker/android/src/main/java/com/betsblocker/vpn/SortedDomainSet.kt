package com.betsblocker.vpn

/**
 * Conjunto somente leitura sobre um arquivo de domínios ordenado por bytes (um por linha).
 * Mantém o texto em um único ByteArray: gasta poucos MB onde um HashSet de Strings gastaria dezenas.
 */
class SortedDomainSet private constructor(
  private val bytes: ByteArray,
  private val starts: IntArray,
  private val ends: IntArray
) {
  val size: Int get() = starts.size

  fun contains(domain: String): Boolean {
    var low = 0
    var high = starts.size - 1
    while (low <= high) {
      val middle = (low + high) ushr 1
      val order = compareLine(middle, domain)
      when {
        order == 0 -> return true
        order < 0 -> low = middle + 1
        else -> high = middle - 1
      }
    }
    return false
  }

  private fun compareLine(index: Int, domain: String): Int {
    val start = starts[index]
    val length = ends[index] - start
    val shared = minOf(length, domain.length)
    for (i in 0 until shared) {
      val difference = (bytes[start + i].toInt() and 0xFF) - domain[i].code
      if (difference != 0) return difference
    }
    return length - domain.length
  }

  companion object {
    private const val NEWLINE = '\n'.code.toByte()
    private const val CARRIAGE_RETURN = '\r'.code.toByte()
    private const val COMMENT = '#'.code.toByte()

    fun fromBytes(bytes: ByteArray): SortedDomainSet {
      var lines = 1
      for (byte in bytes) if (byte == NEWLINE) lines++

      val starts = IntArray(lines)
      val ends = IntArray(lines)
      var count = 0
      var lineStart = 0

      for (position in 0..bytes.size) {
        if (position != bytes.size && bytes[position] != NEWLINE) continue
        var lineEnd = position
        if (lineEnd > lineStart && bytes[lineEnd - 1] == CARRIAGE_RETURN) lineEnd--
        if (lineEnd > lineStart && bytes[lineStart] != COMMENT) {
          starts[count] = lineStart
          ends[count] = lineEnd
          count++
        }
        lineStart = position + 1
      }

      return SortedDomainSet(bytes, starts.copyOf(count), ends.copyOf(count))
    }
  }
}
