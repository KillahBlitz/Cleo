import type { ActivityTab } from '../../../shared/types/activity'
export default defineEventHandler(async event => {
  const user = await currentBidder(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Guarda tu perfil para consultar tu actividad.' })
  const query = getQuery(event), tab = (query.tab ?? 'bids') as ActivityTab
  if (!['bids', 'saved', 'opportunities'].includes(tab) || (query.page !== undefined && (typeof query.page !== 'string' || !/^[1-9]\d{0,5}$/.test(query.page)))) throw createError({ statusCode: 400, statusMessage: 'Filtro de actividad no valido.' })
  const page = Number(query.page || 1), pageSize = 12, now = new Date(), db = await getDatabase()
  const favorites = await existingFavorites(user._id)
  const savedIds = new Set(favorites.map(record => String(record.articleId)))
  const ownBids = { $filter: { input: { $ifNull: ['$bids', []] }, as: 'bid', cond: { $eq: ['$$bid.bidder.userId', user._id] } } }
  // Compute only this person's offers and candidate IDs; never load other contacts.
  const [participating, types] = await Promise.all([
    db.collection('articles').aggregate([
      { $match: { 'bids.bidder.userId': user._id, deletedAt: { $exists: false } } },
      { $project: { ...activityProjection, topBidderId: '$highestBidder.userId',
        myBidAmountCents: { $max: { $map: { input: ownBids, as: 'bid', in: '$$bid.amountCents' } } },
        lastBidAt: { $max: { $map: { input: ownBids, as: 'bid', in: '$$bid.createdAt' } } },
        myDeclined: { $in: [user._id, { $ifNull: ['$declinedBidderIds', []] }] },
        candidateBidderId: { $reduce: { input: { $ifNull: ['$bids', []] }, initialValue: null, in: { $cond: [{ $in: ['$$this.bidder.userId', { $ifNull: ['$declinedBidderIds', []] }] }, '$$value', '$$this.bidder.userId'] } } },
      } }, { $sort: { lastBidAt: -1, _id: -1 } },
    ]).toArray(), catalogTypes(),
  ])
  const bids = participating.map(article => activityItem(article, user._id, types, savedIds.has(String(article._id)), now))
  const opportunities = bids.filter(item => item.status === 'opportunity')
  const active = bids.filter(item => ['leading', 'outbid'].includes(item.status))
  let rows = tab === 'opportunities' ? opportunities : bids
  if (tab === 'saved') {
    const articles = await db.collection('articles').find({ _id: { $in: favorites.map(record => record.articleId) }, deletedAt: { $exists: false } }, { projection: activityProjection }).toArray()
    const articlesById = new Map(articles.map(article => [String(article._id), article]))
    const bidsById = new Map(bids.map(item => [item.id, item]))
    rows = favorites.flatMap(record => { const article = articlesById.get(String(record.articleId)); return article ? [bidsById.get(String(record.articleId)) || activityItem(article, user._id, types, true, now)] : [] })
  }
  return { counts: { active: active.length, saved: tab === 'saved' ? rows.length : favorites.length, opportunities: opportunities.length }, activeClosesAt: active.map(item => item.closesAt), items: rows.slice((page - 1) * pageSize, page * pageSize), tab, page, pageSize, total: rows.length, now: now.toISOString() }
})
