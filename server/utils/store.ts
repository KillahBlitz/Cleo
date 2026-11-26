import type { Document } from 'mongodb'
import type { CategoryType } from '../../shared/types/admin'
import type { StoreArticle } from '../../shared/types/store'
export const publicArticleProjection = { title: 1, description: 1, mode: 1, typeId: 1, star: 1, initialPriceCents: 1, highestBidAmountCents: 1, bidCount: 1, closesAt: 1, status: 1, active: 1, saleType: 1, units: 1, discountPriceCents: 1, 'photos.id': 1 }
export function storeArticle(article: Document, types: CategoryType[]): StoreArticle {
  return {
    id: String(article._id), title: article.title, description: article.description || '', category: types.find(type => type.id === String(article.typeId))?.name || '', typeId: String(article.typeId), mode: article.mode,
    status: article.status, star: article.star === true, initialPriceCents: article.initialPriceCents, highestBidAmountCents: article.highestBidAmountCents ?? null, bidCount: article.bidCount || 0,
    saleType: article.saleType ?? null, units: article.units ?? 0, discountPriceCents: article.discountPriceCents ?? null,
    canBuy: article.active === true && article.mode === 'sale' && article.status === 'available' && article.units > 0,
    closesAt: article.closesAt instanceof Date ? article.closesAt.toISOString() : null, canBid: article.active === true && article.mode === 'auction' && ['available', 'auction'].includes(article.status) && new Date(article.closesAt).getTime() > Date.now(),
    photos: (article.photos || []).map((photo: Document) => ({ id: String(photo.id), url: `/api/public/articles/${article._id}/photos/${photo.id}` })),
  }
}
