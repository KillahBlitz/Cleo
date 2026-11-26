import type { ArticleDocument } from '../../../utils/articles'
export default defineEventHandler(async event => {
  await requireAdmin(event)
  const db = await getDatabase()
  const article = await db.collection<ArticleDocument>('articles').findOne({ _id: articleId(getRouterParam(event, 'id')), deletedAt: { $exists: false } }, { projection: { 'photos.data': 0 } })
  if (!article) throw createError({ statusCode: 404, statusMessage: 'Artículo no encontrado' })
  const types = await catalogTypes()
  return {
    ...adminRecord(article, types), typeId: String(article.typeId), description: article.description, mode: article.mode,
    revision: article.revision ?? 0, saleType: article.saleType ?? null, purchaseCount: article.purchases?.length ?? 0, reservedUnits: (article.purchases || []).filter(p => p.status === 'pending').reduce((sum, p) => sum + p.quantity, 0),
    initialPriceCents: article.initialPriceCents, currency: article.currency,
    highestBidAmountCents: article.highestBidAmountCents, highestBidder: article.highestBidder,
    photos: (article.photos || []).map(photo => ({ id: photo.id.toHexString(), url: `/api/admin/articles/${article._id}/photos/${photo.id}` })),
  }
})
