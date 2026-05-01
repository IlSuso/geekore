import { createServiceClient } from '@/lib/supabase/service'
import { logger } from '@/lib/logger'

const activeRegens = new Map<string, number>()

function tryStartLocalRegen(key: string, ttlMs = 10 * 60 * 1000): boolean {
  const now = Date.now()
  const expiresAt = activeRegens.get(key) || 0
  if (expiresAt > now) return false
  activeRegens.set(key, now + ttlMs)
  return true
}

function finishLocalRegen(key: string, cooldownMs = 0) {
  if (cooldownMs > 0) {
    activeRegens.set(key, Date.now() + cooldownMs)
    return
  }
  activeRegens.delete(key)
}

export async function tryStartRegen(key: string, ttlMs = 10 * 60 * 1000): Promise<boolean> {
  try {
    const supabase = createServiceClient('reco:regen-lock')
    const { data, error } = await supabase.rpc('try_acquire_reco_regen_lock', {
      p_key: key,
      p_ttl_seconds: Math.max(1, Math.ceil(ttlMs / 1000)),
    })
    if (error) throw error
    return data === true
  } catch (err) {
    logger.warn('reco.regen-lock', 'Falling back to local lock', err)
    return tryStartLocalRegen(key, ttlMs)
  }
}

export async function finishRegen(key: string, cooldownMs = 0): Promise<void> {
  try {
    const supabase = createServiceClient('reco:regen-lock')
    const { error } = await supabase.rpc('finish_reco_regen_lock', {
      p_key: key,
      p_cooldown_seconds: Math.max(0, Math.ceil(cooldownMs / 1000)),
    })
    if (error) throw error
  } catch (err) {
    logger.warn('reco.regen-lock', 'Falling back to local unlock', err)
    finishLocalRegen(key, cooldownMs)
  }
}
