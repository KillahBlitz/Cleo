import { ObjectId } from 'mongodb'
import type { BidEntry } from '../../../../utils/bids'
export default defineEventHandler(async event => {
  checkOrigin(event); limitPublicWrite(event, 'bid', 30)
  const user = await currentBidder(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Guarda tu perfil para pujar.' })
  const body = await limitedJson(event)
  if (!Number.isSafeInteger(body?.amountCents) || Number(body.amountCents) < 1 || Number(body.amountCents) > 99_999_999_999 || typeof body.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.requestId)) throw createError({ statusCode: 400, statusMessage: 'Cantidad no valida' })
  const amount = Number(body.amountCents), id = articleId(getRouterParam(event, 'id'))
  if (amount % 100 !== 0) throw createError({ statusCode: 400, statusMessage: 'Usa pesos enteros, sin centavos.' })
  const articles = (await getDatabase()).collection('articles')
  const existing = await articles.findOne({ _id: id, bids: { $elemMatch: { requestId: body.requestId, 'bidder.userId': user._id } } }, { projection: { bids: { $elemMatch: { requestId: body.requestId, 'bidder.userId': user._id } } } })
  if (existing) {
    if (existing.bids[0].amountCents !== amount) throw createError({ statusCode: 409, statusMessage: 'Ese intento ya registro otra cantidad.' })
    return { ok: true, repeated: true }
  }
  const bid: BidEntry = { id: new ObjectId(), requestId: body.requestId, amountCents: amount, createdAt: new Date(), bidder: { userId: user._id, name: user.name, ...(user.facebookUrl ? { facebookUrl: user.facebookUrl } : {}), ...(user.phone ? { phone: user.phone } : {}) } }
  const result = await articles.updateOne({
    _id: id, active: true, mode: 'auction', status: { $in: ['available', 'auction'] },
    $expr: { $gt: ['$closesAt', '$$NOW'] },
    'bids.requestId': { $ne: body.requestId }, 'bids.4999': { $exists: false },
    // The starting price is a reference; only an existing bid sets the minimum.
    $or: [{ highestBidAmountCents: null }, { highestBidAmountCents: { $type: 'number', $lt: amount } }],
  }, {
    $set: { highestBidAmountCents: amount, highestBidder: bid.bidder, updatedAt: bid.createdAt },
    $inc: { bidCount: 1, revision: 1 }, $push: { bids: { $each: [bid], $sort: { amountCents: 1 } } } as any,
  })
  if (!result.modifiedCount) {
    const duplicate = await articles.findOne({ _id: id, bids: { $elemMatch: { requestId: body.requestId, 'bidder.userId': user._id } } }, { projection: { bids: { $elemMatch: { requestId: body.requestId, 'bidder.userId': user._id } } } })
    if (duplicate && duplicate.bids[0].amountCents === amount) return { ok: true, repeated: true }
    throw createError({ statusCode: 409, statusMessage: 'La oferta cambio o la subasta termino. Actualiza el articulo.' })
  }
  setResponseStatus(event, 201)
  return { ok: true, amountCents: amount }
})
