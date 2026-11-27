import { MongoServerError, ObjectId } from 'mongodb'
import type { H3Event } from 'h3'
import type { DeliveryAppointment } from '../../shared/types/deliveries'
import { DELIVERY_TIME_ZONE, DELIVERY_TIMES, deliveryDate, deliveryStart, validDeliveryDate } from '../../shared/utils/deliveries'
interface AppointmentDocument {
  _id: ObjectId; date: string; time: string; startsAt: Date; endsAt: Date; timeZone: string
  recipientName: string; location: string; notes: string; articleId: ObjectId | null
  articleTitle: string; facebookUrl: string; phone?: string; bidderId: ObjectId | null
  active: boolean; revision: number; createdAt: Date; updatedAt: Date; createdBy: ObjectId
  deletedAt?: Date; deletedBy?: ObjectId
}
export async function deliveryCollection() {
  const collection = (await getDatabase()).collection<AppointmentDocument>('appointments')
  await collection.createIndex({ startsAt: 1 }, { unique: true, partialFilterExpression: { active: true }, name: 'one_delivery_per_slot' })
  await collection.createIndex({ articleId: 1 }, { unique: true, partialFilterExpression: { active: true, articleId: { $type: 'objectId' } }, name: 'one_delivery_per_article' })
  return collection
}
export function deliveryDTO(record: AppointmentDocument): DeliveryAppointment {
  return { id: String(record._id), date: record.date, time: record.time, startsAt: record.startsAt.toISOString(), endsAt: record.endsAt.toISOString(), recipientName: record.recipientName, location: record.location, notes: record.notes, articleId: record.articleId ? String(record.articleId) : null, articleTitle: record.articleTitle, facebookUrl: record.facebookUrl || '', phone: record.phone || '', revision: record.revision }
}
export function deliveryMonth(event: H3Event) {
  const month = getQuery(event).month
  if (typeof month !== 'string' || !validDeliveryDate(`${month}-01`)) throw createError({ statusCode: 400, statusMessage: 'Selecciona un mes valido.' })
  return month
}
export async function deliveryCalendar(event: H3Event, admin = false) {
  setHeader(event, 'Cache-Control', 'no-store')
  const month = deliveryMonth(event)
  const records = await (await deliveryCollection()).find({ active: true, date: { $gte: `${month}-01`, $lte: `${month}-31` } }, admin ? {} : { projection: { _id: 0, date: 1, time: 1 } }).sort({ startsAt: 1 }).toArray()
  return { month, timeZone: DELIVERY_TIME_ZONE, now: new Date().toISOString(), busy: records.map(record => ({ date: record.date, time: record.time })), ...(admin ? { appointments: records.map(deliveryDTO) } : {}) }
}
export async function deliveryArticle(id: ObjectId) {
  const article = await (await getDatabase()).collection('articles').findOne({ _id: id, deletedAt: { $exists: false }, mode: 'auction', $or: [{ closesAt: { $lte: new Date() } }, { status: 'sold' }] }, { projection: { title: 1, bids: 1, declinedBidderIds: 1 } })
  const bidder = article && rankedBidders(article.bids || [], article.declinedBidderIds || []).find(bid => !bid.declined)
  if (!article || !bidder) throw createError({ statusCode: 400, statusMessage: 'Selecciona una subasta cerrada con un postor disponible.' })
  return { articleId: id, articleTitle: String(article.title), recipientName: bidder.name, facebookUrl: bidder.facebookUrl, phone: bidder.phone, bidderId: new ObjectId(bidder.userId) }
}
export async function deliveryInput(event: H3Event, existing?: AppointmentDocument) {
  const body = await limitedJson(event)
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw createError({ statusCode: 400, statusMessage: 'Datos no validos.' })
  const allowed = ['date', 'time', 'recipientName', 'location', 'notes', 'articleId', 'revision']
  if (Object.keys(body).some(key => !allowed.includes(key))) throw createError({ statusCode: 400, statusMessage: 'Campo no permitido.' })
  if (!validDeliveryDate(body.date) || typeof body.time !== 'string' || !DELIVERY_TIMES.includes(body.time)) throw createError({ statusCode: 400, statusMessage: 'Elige un turno de 30 minutos entre las 10:00 y las 18:00.' })
  const startsAt = deliveryStart(body.date, body.time)
  if (startsAt.getTime() <= Date.now() && startsAt.getTime() !== existing?.startsAt.getTime()) throw createError({ statusCode: 400, statusMessage: 'La cita debe ser en un horario futuro.' })
  const field = (name: string, min: number, max: number) => {
    const value = body[name] ?? ''
    if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw createError({ statusCode: 400, statusMessage: 'Revisa el nombre, lugar y notas de la cita.' })
    return value.trim()
  }
  if (existing && (!Number.isSafeInteger(body.revision) || body.revision !== existing.revision)) throw createError({ statusCode: 409, statusMessage: 'La cita cambio. Actualiza el calendario.' })
  let linked = { articleId: null as ObjectId | null, articleTitle: '', recipientName: field('recipientName', 2, 60), facebookUrl: '', phone: '', bidderId: null as ObjectId | null }
  if (body.articleId) {
    const id = articleId(typeof body.articleId === 'string' ? body.articleId : undefined)
    // Preserve the agreed person's snapshot when rescheduling an existing delivery.
    linked = existing?.articleId?.equals(id) ? { articleId: id, articleTitle: existing.articleTitle, recipientName: linked.recipientName, facebookUrl: existing.facebookUrl || '', phone: existing.phone || '', bidderId: existing.bidderId } : await deliveryArticle(id)
  }
  return { ...linked, date: body.date, time: body.time, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), timeZone: DELIVERY_TIME_ZONE, location: field('location', 2, 300), notes: field('notes', 0, 1000) }
}
export function deliveryConflict(error: unknown): never {
  if (error instanceof MongoServerError && error.code === 11000) throw createError({ statusCode: 409, statusMessage: error.keyPattern?.articleId ? 'El articulo ya tiene una cita. Edita la existente.' : 'Ese horario acaba de ser ocupado. Elige otro.' })
  throw error
}
