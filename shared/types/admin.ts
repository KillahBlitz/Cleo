export type CommerceMode = 'auction' | 'sale'
export interface CategoryType {
  id: string
  name: string
  slug: string
  mode: CommerceMode
}
export interface AdminRecord {
  id: string
  title: string
  category: string
  status: string
  mode: CommerceMode
  units: number | null
  discountPriceCents: number | null
  star: boolean
  active: boolean | null
  initialPriceCents: number | null
  closesAt: string | null
  photoUrl: string | null
}
export interface AdminOverview {
  mode: CommerceMode
  counts: { articles: number; active: number; scheduled: number; closed: number; available: number; sold: number }
  recentArticles: AdminRecord[]
}
export interface AdminList { items: AdminRecord[]; total: number; page: number; pageSize: number }

export interface ArticleDetail extends AdminRecord {
  revision: number
  saleType: 'item' | 'package' | null
  purchaseCount: number
  reservedUnits: number
  typeId: string
  description: string
  mode: CommerceMode
  currency: string
  highestBidAmountCents: number | null
  highestBidder: { userId: string; name: string; facebookUrl?: string; email?: string; phone?: string } | null
  photos: { id: string; url: string }[]
}
