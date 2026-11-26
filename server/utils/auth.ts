import { scryptSync, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
export function adminSession(event: H3Event) {
  const config = useRuntimeConfig(event)
  if (config.sessionPassword.length < 32) throw createError({ statusCode: 503, statusMessage: 'Authentication is not configured' })
  return useSession<{ adminId: string }>(event, { name: 'cleo-session', password: config.sessionPassword, maxAge: 60 * 60 * 8, sessionHeader: false, cookie: { httpOnly: true, secure: !import.meta.dev, sameSite: 'strict', path: '/' } })
}
export function verifyPassword(password: string, hash: string) {
  const [salt, expected] = hash.split(':')
  if (!salt || !expected || !/^[a-f0-9]{128}$/.test(expected)) return false
  const actual = scryptSync(password, salt, 64)
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'))
}
export function checkOrigin(event: H3Event) {
  const origin = getHeader(event, 'origin')
  if (origin && origin !== getRequestURL(event).origin) throw createError({ statusCode: 403, statusMessage: 'Invalid origin' })
}
// In-memory limit for the initial single-server installation.
const attempts = new Map<string, { count: number; expires: number }>()
export function limitLogin(event: H3Event) {
  const now = Date.now()
  for (const [key, entry] of attempts) if (entry.expires < now) attempts.delete(key)
  const key = getRequestIP(event) || 'unknown'
  const entry = attempts.get(key) || { count: 0, expires: now + 15 * 60_000 }
  if (entry.count >= 10) throw createError({ statusCode: 429, statusMessage: 'Too many attempts' })
  entry.count++; attempts.set(key, entry)
  return () => attempts.delete(key)
}
