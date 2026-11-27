import { ObjectId } from 'mongodb'
export interface BidEntry { id: ObjectId; requestId: string; amountCents: number; createdAt: Date; bidder: { userId: ObjectId; name: string; facebookUrl: string } }
export function rankedBidders(bids: BidEntry[], declined: ObjectId[] = []) {
  const skipped = new Set(declined.map(String)), seen = new Set<string>()
  return [...bids].sort((a, b) => b.amountCents - a.amountCents).filter(bid => {
    const id = String(bid.bidder.userId)
    if (seen.has(id)) return false
    seen.add(id); return true
  }).map(bid => ({ bidId: String(bid.id), userId: String(bid.bidder.userId), name: bid.bidder.name, facebookUrl: bid.bidder.facebookUrl, amountCents: bid.amountCents, declined: skipped.has(String(bid.bidder.userId)) }))
}
