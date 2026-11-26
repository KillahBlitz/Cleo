import type { ArticleDocument } from '../../../../utils/articles'
import type { PurchaseStatus } from '../../../../../shared/types/purchases'
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event); checkOrigin(event)
  const id = articleId(getRouterParam(event, 'articleId')), purchaseId = articleId(getRouterParam(event, 'id')), body = await limitedJson(event)
  if (!body || Object.keys(body).some(key => key !== 'status') || typeof body.status !== 'string' || !['pending', 'cancelled', 'completed'].includes(body.status)) throw createError({ statusCode: 400, statusMessage: 'Estado de compra no válido.' })
  const articles = (await getDatabase()).collection<ArticleDocument>('articles')
  for (let attempt = 0; attempt < 8; attempt++) {
    const article = await articles.findOne({ _id: id, mode: 'sale', deletedAt: { $exists: false } }, { projection: { photos: 0, bids: 0 } })
    const purchase = article?.purchases?.find(p => p.id.equals(purchaseId))
    if (!article || !purchase) throw createError({ statusCode: 404, statusMessage: 'Compra no encontrada.' })
    if (purchase.status === body.status) return { purchase: purchaseData(purchase, article, true) }
    if (purchase.status !== 'pending') throw createError({ statusCode: 409, statusMessage: 'La compra ya está cerrada.' })
    const now = new Date(), updated = { ...purchase, status: body.status as PurchaseStatus, updatedAt: now, updatedBy: admin._id }
    const sold = body.status === 'completed' && article.units === 0 && !article.purchases?.some(p => !p.id.equals(purchaseId) && p.status === 'pending')
    const result = await articles.updateOne({ _id: id, ...articleRevision(article), purchases: { $elemMatch: { id: purchaseId, status: 'pending' } } }, {
      $set: { 'purchases.$': updated, updatedAt: now, ...(sold ? { status: 'sold' as const, soldAt: now, soldBy: admin._id, star: false } : {}) },
      $inc: { revision: 1, ...(body.status === 'cancelled' ? { units: purchase.quantity } : {}) },
      ...(sold ? { $unset: { starSlot: '' as const } } : {}),
    })
    if (result.matchedCount) return { purchase: purchaseData(updated, { ...article, ...(sold ? { status: 'sold' } : {}) }, true) }
  }
  throw createError({ statusCode: 409, statusMessage: 'La compra cambió. Actualiza la lista.' })
})
