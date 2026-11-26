export type ActivityTab = 'bids' | 'saved' | 'opportunities'
export type ActivityStatus = 'leading' | 'outbid' | 'highest' | 'opportunity' | 'waiting' | 'declined' | 'unavailable' | 'ended' | 'available' | 'sold'
export interface ActivityItem {
  id: string; title: string; category: string; mode: 'auction' | 'sale'; photoUrl: string | null
  initialPriceCents: number | null; highestBidAmountCents: number | null; myBidAmountCents: number | null
  closesAt: string | null; lastBidAt: string | null; viewable: boolean; saved: boolean
  status: ActivityStatus; closedStatus: ActivityStatus
}
export interface PersonalActivity {
  counts: { active: number; saved: number; opportunities: number }
  activeClosesAt: string[]
  items: ActivityItem[]; tab: ActivityTab; page: number; pageSize: number; total: number; now: string
}
export interface FavoriteList { signedIn: boolean; ids: string[] }
