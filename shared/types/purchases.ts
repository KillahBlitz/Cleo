export type PurchaseStatus = 'pending' | 'cancelled' | 'completed'
export interface PurchaseItem {
  id: string; articleId: string; title: string; category: string; saleType: 'item' | 'package'
  quantity: number; unitPriceCents: number; originalPriceCents: number; totalCents: number
  status: PurchaseStatus; createdAt: string; updatedAt: string; viewable: boolean
  buyer?: { name: string; facebookUrl: string }
}
export interface PurchaseList { items: PurchaseItem[]; total: number; page: number; pageSize: number; pending: number }
