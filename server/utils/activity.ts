import type { Document } from 'mongodb'
import { ObjectId } from 'mongodb'
import type { ActivityItem, ActivityStatus } from '../../shared/types/activity'
import type { CategoryType } from '../../shared/types/admin'
export const activityProjection = {
  title: 1, typeId: 1, mode: 1, active: 1, deletedAt: 1, units: 1, status: 1, closesAt: 1,
  initialPriceCents: 1, highestBidAmountCents: 1, 'photos.id': 1,
}
export async function favoriteCollection() {
  const collection = (await getDatabase()).collection<{ userId: ObjectId; articleId: ObjectId; createdAt: Date }>('favorites')
  await collection.createIndex({ userId: 1, articleId: 1 }, { unique: true, name: 'one_favorite_per_person' })
  return collection
}
export async function existingFavorites(userId: ObjectId) {
  return (await favoriteCollection()).aggregate<{ articleId: ObjectId; createdAt: Date }>([
    { $match: { userId } },
    { $lookup: { from: 'articles', let: { articleId: '$articleId' }, pipeline: [
      { $match: { $expr: { $eq: ['$_id', '$$articleId'] }, deletedAt: { $exists: false } } }, { $project: { _id: 1 } },
    ], as: 'existingArticle' } },
    { $match: { 'existingArticle.0': { $exists: true } } },
    { $sort: { createdAt: -1, _id: -1 } }, { $project: { articleId: 1, createdAt: 1 } },
  ]).toArray()
}
export function activityItem(article: Document, userId: ObjectId, types: CategoryType[], saved: boolean, now: Date): ActivityItem {
  const mine = article.myBidAmountCents ?? null
  const visibleHistory = article.active === true && !article.deletedAt
  const viewable = visibleHistory && article.status !== 'sold'
  const canParticipate = viewable && ['available', 'auction'].includes(article.status)
  const highest = article.topBidderId?.equals(userId) === true
  const candidate = article.candidateBidderId?.equals(userId) === true
  const closedStatus: ActivityStatus = article.status === 'sold' ? 'sold' : !viewable ? 'unavailable' : !canParticipate ? 'ended' : mine === null ? 'ended' : article.myDeclined ? 'declined' : candidate ? highest ? 'highest' : 'opportunity' : 'waiting'
  const open = canParticipate && (article.mode === 'sale' ? (article.units ?? 0) > 0 : article.closesAt instanceof Date && article.closesAt > now)
  const status: ActivityStatus = article.status === 'sold' ? 'sold' : !viewable ? 'unavailable' : open ? mine === null ? 'available' : highest ? 'leading' : 'outbid' : closedStatus
  return {
    id: String(article._id), title: visibleHistory ? String(article.title) : 'Artículo no disponible', category: visibleHistory ? types.find(type => type.id === String(article.typeId))?.name || '' : '', mode: article.mode === 'sale' ? 'sale' : 'auction',
    photoUrl: visibleHistory && article.photos?.[0]?.id ? `/api/public/${article.status === 'sold' ? 'activity/' : ''}articles/${article._id}/photos/${article.photos[0].id}` : null,
    initialPriceCents: article.initialPriceCents ?? null, highestBidAmountCents: article.highestBidAmountCents ?? null, myBidAmountCents: mine,
    closesAt: article.closesAt instanceof Date ? article.closesAt.toISOString() : null, lastBidAt: article.lastBidAt instanceof Date ? article.lastBidAt.toISOString() : null,
    viewable, saved, status, closedStatus,
  }
}
