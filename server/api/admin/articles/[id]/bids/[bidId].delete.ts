import { ObjectId } from 'mongodb'
export default defineEventHandler(async event => {
  await requireAdmin(event); checkOrigin(event)
  const id = articleId(getRouterParam(event, 'id')), rawBidId = getRouterParam(event, 'bidId')
  if (!rawBidId || !/^[a-f\d]{24}$/i.test(rawBidId)) throw createError({ statusCode: 400, statusMessage: 'Puja no válida.' })
  const bidId = new ObjectId(rawBidId), articles = (await getDatabase()).collection('articles')
  const articleFilter = { _id: id, mode: 'auction', deletedAt: { $exists: false } }
  // Remove the embedded bid and recalculate from the remaining offers in one atomic write.
  // A concurrent bid is included, never overwritten by a previously read snapshot.
  const result = await articles.updateOne({ ...articleFilter, 'bids.id': bidId }, [
    { $set: { bids: { $filter: { input: { $ifNull: ['$bids', []] }, as: 'bid', cond: { $ne: ['$$bid.id', bidId] } } } } },
    { $set: {
      bidCount: { $size: '$bids' },
      highestBidAmountCents: { $ifNull: [{ $max: '$bids.amountCents' }, null] },
      highestBidder: { $let: { vars: { best: { $reduce: {
        input: '$bids', initialValue: null,
        in: { $cond: [{ $gt: ['$$this.amountCents', { $ifNull: ['$$value.amountCents', -1] }] }, '$$this', '$$value'] },
      } } }, in: { $ifNull: ['$$best.bidder', null] } } },
      declinedBidderIds: { $filter: { input: { $ifNull: ['$declinedBidderIds', []] }, as: 'userId', cond: { $in: ['$$userId', '$bids.bidder.userId'] } } },
      revision: { $add: [{ $ifNull: ['$revision', 0] }, 1] }, updatedAt: '$$NOW',
    } },
  ])
  // Repeating a deletion is safe, including after a lost network response.
  if (!result.matchedCount && !await articles.findOne(articleFilter, { projection: { _id: 1 } })) throw createError({ statusCode: 404, statusMessage: 'Artículo no encontrado.' })
  return { ok: true, removed: result.modifiedCount === 1 }
})
