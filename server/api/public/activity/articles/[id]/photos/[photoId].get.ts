import type { ArticleDocument } from '../../../../../../utils/articles'
export default defineEventHandler(async event => {
  const user = await currentBidder(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Completa tu perfil.' })
  const id = articleId(getRouterParam(event, 'id')), db = await getDatabase()
  const saved = await db.collection('favorites').findOne({ articleId: id, userId: user._id }, { projection: { _id: 1 } })
  const article = await db.collection<ArticleDocument>('articles').findOne({ _id: id, active: true, deletedAt: { $exists: false },
    ...(!saved ? { $or: [{ 'bids.bidder.userId': user._id }, { 'purchases.buyer.userId': user._id }] } : {}),
  }, { projection: { photos: { $elemMatch: { id: articleId(getRouterParam(event, 'photoId')) } } } })
  const photo = article?.photos?.[0]
  if (!photo) throw createError({ statusCode: 404, statusMessage: 'Foto no disponible.' })
  setHeaders(event, { 'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' })
  return send(event, Buffer.from(photo.data.buffer))
})
