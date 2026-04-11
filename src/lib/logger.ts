// src/lib/logger.ts
// S5: Logger che non espone dati sensibili in produzione.
// In dev: output completo su console.
// In prod: silenzio totale — nessuna info sensibile nei log server/client.
//
// Tutti i console.error/log nelle API route devono usare questo modulo.

const isDev = process.env.NODE_ENV === 'development'

// Campi che non devono mai apparire nei log
const SENSITIVE_KEYS = [
  'password', 'token', 'secret', 'key', 'authorization',
  'cookie', 'session', 'email', 'phone', 'steamid', 'steam_id',
  'user_id', 'ip', 'x-forwarded-for',
]

function sanitize(arg: unknown): unknown {
  if (!isDev) return '[redacted]'
  if (arg === null || arg === undefined) return arg
  if (typeof arg === 'string') {
    // Non loggare JWT (Bearer token)
    if (arg.startsWith('Bearer ') || (arg.split('.').length === 3 && arg.length > 50)) {
      return '[JWT redacted]'
    }
    return arg
  }
  if (arg instanceof Error) {
    return { message: arg.message, name: arg.name }
  }
  if (typeof arg === 'object') {
    const obj = arg as Record<string, unknown>
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.some(s => k.toLowerCase().includes(s))) {
        clean[k] = '[redacted]'
      } else {
        clean[k] = sanitize(v)
      }
    }
    return clean
  }
  return arg
}

export const logger = {
  log: (prefix: string, ...args: unknown[]) => {
    if (isDev) console.log(`[${prefix}]`, ...args.map(sanitize))
  },
  error: (prefix: string, ...args: unknown[]) => {
    if (isDev) console.error(`[${prefix}]`, ...args.map(sanitize))
  },
  warn: (prefix: string, ...args: unknown[]) => {
    if (isDev) console.warn(`[${prefix}]`, ...args.map(sanitize))
  },
  /** Usato per metriche/analytics — non contiene dati sensibili */
  metric: (event: string, data?: Record<string, unknown>) => {
    if (isDev) console.log(`[metric:${event}]`, data)
  },
}