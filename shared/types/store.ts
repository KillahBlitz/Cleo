import type { CommerceMode, CategoryType } from './admin'
export interface BidderProfile { id: string; name: string; facebookUrl: string; phone: string }
export interface StoreArticle {
  id: string; title: string; description: string; category: string; typeId: string; mode: CommerceMode
  status: 'available' | 'auction' | 'sold'; star: boolean; initialPriceCents: number; highestBidAmountCents: number | null; bidCount: number
  saleType: 'item' | 'package' | null; units: number; discountPriceCents: number | null; canBuy: boolean
  closesAt: string | null; canBid: boolean; photos: { id: string; url: string }[]
}
export interface StoreCatalog { items: StoreArticle[]; featured: StoreArticle[]; total: number; page: number; pageSize: number; types: CategoryType[] }
export interface PublicBid { amountCents: number; name: string; createdAt: string }
