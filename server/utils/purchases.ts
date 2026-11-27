import { ObjectId, type Document } from 'mongodb'
import type { H3Event } from 'h3'
import type { ArticleDocument } from './articles'
import type { PurchaseItem, PurchaseStatus } from '../../shared/types/purchases'
export interface PurchaseDocument {
  id: ObjectId; requestId: string; title: string; category: string; saleType: 'item' | 'package'
  quantity: number; unitPriceCents: number; originalPriceCents: number; totalCents: number
  buyer: { userId: ObjectId; name: string; facebookUrl?: string; phone?: string }
  status: PurchaseStatus; createdAt: Date; updatedAt: Date; updatedBy?: ObjectId
}
export function salePrice(article: Pick<ArticleDocument, 'saleType' | 'discountPriceCents' | 'initialPriceCents'>) {
  return article.saleType === 'package' ? article.discountPriceCents : article.initialPriceCents
}
export function purchaseData(purchase: PurchaseDocument, article: Document, admin = false): PurchaseItem {
  return {
    id: String(purchase.id), articleId: String(article._id), title: purchase.title, category: purchase.category, saleType: purchase.saleType,
    quantity: purchase.quantity, unitPriceCents: purchase.unitPriceCents, originalPriceCents: purchase.originalPriceCents, totalCents: purchase.totalCents,
    status: purchase.status, createdAt: purchase.createdAt.toISOString(), updatedAt: purchase.updatedAt.toISOString(),
    viewable: article.active === true && article.status !== 'sold',
    ...(admin ? { buyer: { name: purchase.buyer.name, facebookUrl: purchase.buyer.facebookUrl || '', phone: purchase.buyer.phone || '' } } : {}),
  }
}
export async function listPurchases(event: H3Event, userId?: ObjectId) {
  const query = getQuery(event), pageText = String(query.page || '1'), state = query.status
  if (!/^[1-9]\d{0,5}$/.test(pageText) || (state && !['pending', 'cancelled', 'completed'].includes(String(state)))) throw createError({ statusCode: 400, statusMessage: 'Filtro de compras no válido.' })
  const page = Number(pageText), pageSize = 20
  const match: Document = { mode: 'sale', deletedAt: { $exists: false } }
  if (userId) match['purchases.buyer.userId'] = userId
  if (query.articleId) match._id = articleId(String(query.articleId))
  const rows: Document[] = [
    { $match: match },
    { $project: { active: 1, status: 1, purchases: userId ? { $filter: { input: '$purchases', as: 'purchase', cond: { $eq: ['$$purchase.buyer.userId', userId] } } } : 1 } },
    { $unwind: '$purchases' },
  ]
  const [result] = await (await getDatabase()).collection('articles').aggregate([
    ...rows,
    { $facet: {
      items: [...(state ? [{ $match: { 'purchases.status': state } }] : []), { $sort: { 'purchases.createdAt': -1, 'purchases.id': -1 } }, { $skip: (page - 1) * pageSize }, { $limit: pageSize }],
      total: [...(state ? [{ $match: { 'purchases.status': state } }] : []), { $count: 'count' }],
      pending: [{ $match: { 'purchases.status': 'pending' } }, { $count: 'count' }],
    } },
  ]).toArray()
  return { items: (result?.items || []).map((row: Document) => purchaseData(row.purchases, row, !userId)), total: result?.total[0]?.count || 0, pending: result?.pending[0]?.count || 0, page, pageSize }
}
