import type { H3Event } from 'h3'
import type { Document } from 'mongodb'
import type { AdminRecord, CategoryType } from '../../shared/types/admin'

export async function requireAdmin(event: H3Event) {
  setHeader(event, 'Cache-Control', 'no-store')
  const session = await adminSession(event)
  const admin = await findSessionAdmin(session.data.adminId)
  if (!admin) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  return admin
}

export function adminRecord(document: Document, types: CategoryType[] = []): AdminRecord {
  return {
    id: String(document._id),
    title: typeof document.title === 'string' ? document.title : 'Sin título',
    category: types.find(type => type.id === String(document.typeId))?.name ?? (typeof document.category === 'string' ? document.category : '—'),
    mode: document.mode, units: document.units ?? null, discountPriceCents: document.discountPriceCents ?? null,
    star: document.star === true,
    active: typeof document.active === 'boolean' ? document.active : null,
    initialPriceCents: typeof document.initialPriceCents === 'number' ? document.initialPriceCents : null,
    closesAt: document.closesAt instanceof Date ? document.closesAt.toISOString() : null,
    photoUrl: document.photos?.[0]?.id ? `/api/admin/articles/${document._id}/photos/${document.photos[0].id}` : null,
    status: typeof document.status === 'string' ? document.status : 'draft',
  }
}

export async function adminList(event: H3Event, collection: 'articles' | 'auctions', eligible = false) {
  await requireAdmin(event)
  const { mode, types, categoryFilter } = await catalogFilters(event, undefined, collection === 'auctions' || eligible ? 'auction' : undefined)
  const query = getQuery(event)
  const search = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : ''
  const page = Math.min(10000, Math.max(1, Number.parseInt(String(query.page || '1'), 10) || 1))
  const allowed = collection === 'articles' ? ['draft', 'available', 'auction', 'sold'] : ['draft', 'scheduled', 'active', 'closed']
  const filter: Document = { ...categoryFilter, deletedAt: { $exists: false } }
  if (collection === 'articles' && mode) filter.mode = mode
  if (collection === 'articles' && ['active', 'inactive'].includes(String(query.status))) { filter.active = query.status === 'active'; if (query.status === 'active') filter.status = { $ne: 'sold' } }
  if (typeof query.status === 'string' && allowed.includes(query.status)) filter.status = query.status
  if (collection === 'articles' && mode === 'sale' && query.status === 'available') Object.assign(filter, { active: true, units: { $gt: 0 } })
  if (eligible) Object.assign(filter, { active: true, mode: 'auction', status: 'available', closesAt: { $gt: new Date() } })
  if (search) filter.title = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
  const db = await getDatabase()
  const records = db.collection(collection)
  const [items, total] = await Promise.all([
    records.find(filter, { projection: { title: 1, typeId: 1, category: 1, status: 1, active: 1, initialPriceCents: 1, 'photos.id': 1, closesAt: 1, star: 1, mode: 1, units: 1, discountPriceCents: 1 } }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 20).limit(20).toArray(),
    records.countDocuments(filter),
  ])
  return { items: items.map(item => adminRecord(item, types)), total, page, pageSize: 20 }
}
