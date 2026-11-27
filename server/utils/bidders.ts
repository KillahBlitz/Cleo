import type { H3Event } from 'h3'
import { MongoServerError, ObjectId } from 'mongodb'
export interface BidderDocument {
  _id: ObjectId
  kind: 'bidder'
  name: string
  facebookUrl?: string
  phone?: string
  facebookStatus?: 'provided' | 'pending' | 'verified' | 'rejected'
  createdAt: Date
  updatedAt: Date
}
export function bidderSession(event: H3Event, writable = true) {
  const config = useRuntimeConfig(event)
  if (config.sessionPassword.length < 32) throw createError({ statusCode: 503, statusMessage: 'Session unavailable' })
  return useSession<{ userId: string }>(event, { name: 'cleo-bidder', password: config.sessionPassword, maxAge: 180 * 86400, sessionHeader: false, cookie: writable ? { httpOnly: true, secure: !import.meta.dev, sameSite: 'strict', path: '/' } : false })
}
export async function currentBidder(event: H3Event) {
  setHeader(event, 'Cache-Control', 'no-store')
  // Anonymous/expired reads must not overwrite a profile cookie from a concurrent save.
  if (!getCookie(event, 'cleo-bidder')) return null
  const session = await bidderSession(event, false)
  if (!session.data.userId || !ObjectId.isValid(session.data.userId)) return null
  return (await getDatabase()).collection<BidderDocument>('users').findOne({ _id: new ObjectId(session.data.userId), kind: 'bidder' })
}
export function profileData(user: BidderDocument | null) {
  return user ? { id: user._id.toHexString(), name: user.name, facebookUrl: user.facebookUrl || '', phone: user.phone || '' } : null
}
const contactIndexes = new Map<string, Promise<void>>()
export async function bidderCollection() {
  const db = await getDatabase(), users = db.collection<BidderDocument>('users')
  let ready = contactIndexes.get(db.databaseName)
  if (!ready) {
    ready = (async () => {
      // Build the replacement before removing the legacy index: Facebook stays unique,
      // while multiple profiles can omit it. Absent contacts are not stored as empty strings.
      await users.createIndexes([
        { key: { facebookUrl: 1, kind: 1 }, name: 'bidder_facebook_contact', unique: true, partialFilterExpression: { kind: 'bidder', facebookUrl: { $type: 'string' } } },
        { key: { phone: 1, kind: 1 }, name: 'bidder_phone_contact', unique: true, partialFilterExpression: { kind: 'bidder', phone: { $type: 'string' } } },
      ])
      const legacy = (await users.listIndexes().toArray()).find(index => index.name === 'facebookUrl_1' && index.unique && index.key.facebookUrl === 1 && Object.keys(index.key).length === 1 && index.partialFilterExpression?.kind === 'bidder' && Object.keys(index.partialFilterExpression).length === 1)
      if (legacy) {
        try { await users.dropIndex(legacy.name!) }
        catch (error) { if (!(error instanceof MongoServerError && error.code === 27)) throw error }
      }
    })().catch(error => { contactIndexes.delete(db.databaseName); throw error })
    contactIndexes.set(db.databaseName, ready)
  }
  await ready
  return users
}
export function contactPhone(value: string) {
  const invalid = () => createError({ statusCode: 400, statusMessage: 'Usa un teléfono de 10 dígitos o incluye el código de país con +.' })
  if (value.length > 40 || !/^\+?[\d ().-]+$/.test(value)) throw invalid()
  const compact = value.replace(/[ ().-]/g, '')
  if (/^\d{10}$/.test(compact)) return `+52${compact}`
  if (/^52\d{10}$/.test(compact)) return `+${compact}`
  if (/^\+[1-9]\d{7,14}$/.test(compact)) return compact
  throw invalid()
}
export function profileContact(body: { facebookUrl?: unknown; phone?: unknown }) {
  const field = (value: unknown) => {
    if (value === undefined || value === null) return ''
    if (typeof value !== 'string') throw createError({ statusCode: 400, statusMessage: 'Revisa tus datos de contacto.' })
    return value.trim()
  }
  const facebook = field(body.facebookUrl), telephone = field(body.phone)
  if (!facebook && !telephone) throw createError({ statusCode: 400, statusMessage: 'Agrega tu perfil de Facebook o un número telefónico.' })
  return { ...(facebook ? { facebookUrl: facebookProfile(facebook) } : {}), ...(telephone ? { phone: contactPhone(telephone) } : {}) }
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
