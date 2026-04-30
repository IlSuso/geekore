const activeRegens = new Map<string, number>()

export function tryStartRegen(key: string, ttlMs = 10 * 60 * 1000): boolean {
  const now = Date.now()
  const expiresAt = activeRegens.get(key) || 0
  if (expiresAt > now) return false
  activeRegens.set(key, now + ttlMs)
  return true
}

export function finishRegen(key: string, cooldownMs = 0) {
  if (cooldownMs > 0) {
    activeRegens.set(key, Date.now() + cooldownMs)
    return
  }
  activeRegens.delete(key)
}
