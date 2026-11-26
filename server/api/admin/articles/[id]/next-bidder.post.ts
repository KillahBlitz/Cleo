import { ObjectId } from 'mongodb'
export default defineEventHandler(async event => {
  await requireAdmin(event); checkOrigin(event)
  const body = await limitedJson(event), id = articleId(getRouterParam(event, 'id'))
  const userId = articleId(typeof body?.userId === 'string' ? body.userId : undefined)
  const articles = (await getDatabase()).collection('articles')
  const article = await articles.findOne({ _id: id, deletedAt: { $exists: false } }, { projection: { bids: 1, declinedBidderIds: 1, closesAt: 1, status: 1 } })
  if (article?.status === 'sold') throw createError({ statusCode: 409, statusMessage: 'El articulo ya fue vendido.' })
  if (!article || article.closesAt > new Date()) throw createError({ statusCode: 409, statusMessage: 'Espera a que termine la subasta.' })
  const declined = article.declinedBidderIds || []
  const next = rankedBidders(article.bids || [], declined).find(bidder => !bidder.declined)
  if (next?.userId !== String(userId)) throw createError({ statusCode: 409, statusMessage: 'El orden cambio. Actualiza los postores.' })
  const result = await articles.updateOne({ _id: id, status: { $ne: 'sold' }, $expr: { $lte: ['$closesAt', '$$NOW'] }, declinedBidderIds: article.declinedBidderIds ?? { $exists: false } }, { $addToSet: { declinedBidderIds: new ObjectId(userId) } })
  if (!result.modifiedCount) throw createError({ statusCode: 409, statusMessage: 'El orden cambio. Actualiza los postores.' })
  return { ok: true }
})
