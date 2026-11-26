import type { H3Event } from 'h3'
import { ObjectId } from 'mongodb'
export interface BidderDocument {
  _id: ObjectId
  kind: 'bidder'
  name: string
  facebookUrl: string
  facebookStatus: 'provided' | 'pending' | 'verified' | 'rejected'
  createdAt: Date
  updatedAt: Date
}
export function bidderSession(event: H3Event) {
  const config = useRuntimeConfig(event)
  if (config.sessionPassword.length < 32) throw createError({ statusCode: 503, statusMessage: 'Session unavailable' })
  return useSession<{ userId: string }>(event, { name: 'cleo-bidder', password: config.sessionPassword, maxAge: 180 * 86400, sessionHeader: false, cookie: { httpOnly: true, secure: !import.meta.dev, sameSite: 'strict', path: '/' } })
}
export async function currentBidder(event: H3Event) {
  setHeader(event, 'Cache-Control', 'no-store')
  const session = await bidderSession(event)
  if (!session.data.userId || !ObjectId.isValid(session.data.userId)) return null
  return (await getDatabase()).collection<BidderDocument>('users').findOne({ _id: new ObjectId(session.data.userId), kind: 'bidder' })
}
export function profileData(user: BidderDocument | null) {
  return user ? { id: user._id.toHexString(), name: user.name, facebookUrl: user.facebookUrl } : null
}
export function facebookProfile(value: unknown) {
  const invalid = () => createError({ statusCode: 400, statusMessage: 'Usa el enlace directo a tu perfil de Facebook.' })
  if (typeof value !== 'string' || value.length > 500) throw invalid()
  let url: URL
  try { url = new URL(value.trim()) } catch { throw invalid() }
  if (url.protocol !== 'https:' || !['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(url.hostname.toLowerCase()) || url.username || url.password || url.port || url.hash) throw invalid()
  const path = url.pathname.replace(/\/$/, '')
  if (path === '/profile.php' && /^\d{5,25}$/.test(url.searchParams.get('id') || '')) return `https://www.facebook.com/profile.php?id=${url.searchParams.get('id')}`
  const slug = path.slice(1)
  const reserved = ['login', 'login.php', 'logout', 'share', 'sharer', 'sharer.php', 'groups', 'pages', 'watch', 'reel', 'reels', 'marketplace', 'events', 'help', 'settings', 'privacy', 'photo', 'photo.php', 'photos', 'gaming', 'stories', 'friends', 'recover', 'checkpoint', 'dialog', 'messages', 'business']
  if (!/^[a-zA-Z0-9.]{3,100}$/.test(slug) || reserved.includes(slug.toLowerCase())) throw invalid()
  return `https://www.facebook.com/${slug.toLowerCase()}`
}
const requests = new Map<string, { count: number; until: number }>()
export function limitPublicWrite(event: H3Event, prefix: string, max = 30) {
  const now = Date.now()
  for (const [key, value] of requests) if (value.until < now) requests.delete(key)
  const key = `${prefix}:${getRequestIP(event) || 'unknown'}`
  const value = requests.get(key) || { count: 0, until: now + 60_000 }
  if (value.count >= max) throw createError({ statusCode: 429, statusMessage: 'Espera un momento antes de intentarlo de nuevo.' })
  value.count++; requests.set(key, value)
}
