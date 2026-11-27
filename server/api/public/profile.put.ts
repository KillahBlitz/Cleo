import { MongoServerError, ObjectId } from 'mongodb'
import type { BidderDocument } from '../../utils/bidders'
export default defineEventHandler(async event => {
  checkOrigin(event); limitPublicWrite(event, 'profile', 10)
  const body = await limitedJson(event)
  if (typeof body?.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 60) throw createError({ statusCode: 400, statusMessage: 'El nombre debe tener entre 2 y 60 caracteres.' })
  const name = body.name.trim().replace(/\s+/g, ' '), contact = profileContact(body)
  const current = await currentBidder(event)
  const users = await bidderCollection()
  const now = new Date()
  try {
    if (current) {
      const updated = await users.findOneAndUpdate({ _id: current._id, kind: 'bidder', updatedAt: current.updatedAt }, {
        $set: { name, ...contact, updatedAt: now, ...(contact.facebookUrl ? { facebookStatus: 'provided' as const } : {}) },
        $unset: { ...(!contact.facebookUrl ? { facebookUrl: '', facebookStatus: '' } : {}), ...(!contact.phone ? { phone: '' } : {}) },
      }, { returnDocument: 'after' })
      if (!updated) throw createError({ statusCode: 409, statusMessage: 'Tu perfil cambio. Recarga e intenta otra vez.' })
      return { profile: profileData(updated) }
    }
    const user: BidderDocument = { _id: new ObjectId(), kind: 'bidder', name, ...contact, ...(contact.facebookUrl ? { facebookStatus: 'provided' as const } : {}), createdAt: now, updatedAt: now }
    await users.insertOne(user)
    const session = await bidderSession(event)
    await session.update({ userId: user._id.toHexString() })
    return { profile: profileData(user) }
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) throw createError({ statusCode: 409, statusMessage: 'Ese contacto ya está registrado. Usa el navegador donde lo guardaste o contacta a Cleo.' })
    throw error
  }
})
