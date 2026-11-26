import { MongoServerError } from 'mongodb'

export default defineEventHandler(async event => {
  const admin = await requireAdmin(event)
  checkOrigin(event)
  const body = await limitedJson(event)
  if (!body || typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 80) throw createError({ statusCode: 400, statusMessage: 'Escribe un nombre de 2 a 80 caracteres' })
  const name = body.name.trim().replace(/\s+/g, ' ')
  const mode = catalogMode(body.mode, 'auction')!
  const slug = name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Escribe un nombre válido' })
  const db = await getDatabase()
  const types = db.collection('types')
  await types.createIndex({ mode: 1, slug: 1 }, { unique: true })
  const last = await types.find({ mode }).sort({ order: -1 }).limit(1).next()
  const now = new Date()
  try {
    const result = await types.insertOne({ name, slug, mode, active: true, order: (Number(last?.order) || 0) + 1, createdAt: now, updatedAt: now, createdBy: admin._id })
    setResponseStatus(event, 201)
    return { id: result.insertedId.toHexString(), name, slug, mode }
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) throw createError({ statusCode: 409, statusMessage: 'Esta categoría ya existe' })
    throw error
  }
})
