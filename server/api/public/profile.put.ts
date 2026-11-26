import { MongoServerError, ObjectId } from 'mongodb'
import type { BidderDocument } from '../../utils/bidders'
export default defineEventHandler(async event => {
  checkOrigin(event); limitPublicWrite(event, 'profile', 10)
  const body = await limitedJson(event)
  if (typeof body?.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 60) throw createError({ statusCode: 400, statusMessage: 'El nombre debe tener entre 2 y 60 caracteres.' })
  const name = body.name.trim().replace(/\s+/g, ' '), facebookUrl = facebookProfile(body.facebookUrl)
  const current = await currentBidder(event), session = await bidderSession(event)
  const users = (await getDatabase()).collection<BidderDocument>('users')
  await users.createIndex({ facebookUrl: 1 }, { unique: true, partialFilterExpression: { kind: 'bidder' } })
  const now = new Date()
  try {
    if (current) {
      const updated = await users.findOneAndUpdate({ _id: current._id, kind: 'bidder', updatedAt: current.updatedAt }, { $set: { name, facebookUrl, updatedAt: now, facebookStatus: 'provided' as const } }, { returnDocument: 'after' })
      if (!updated) throw createError({ statusCode: 409, statusMessage: 'Tu perfil cambio. Recarga e intenta otra vez.' })
      return { profile: profileData(updated) }
    }
    const user: BidderDocument = { _id: new ObjectId(), kind: 'bidder', name, facebookUrl, facebookStatus: 'provided', createdAt: now, updatedAt: now }
    await users.insertOne(user); await session.update({ userId: user._id.toHexString() })
    return { profile: profileData(user) }
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) throw createError({ statusCode: 409, statusMessage: 'Ese perfil ya esta registrado. Usa el navegador donde lo guardaste o contacta a Cleo.' })
    throw error
  }
})
