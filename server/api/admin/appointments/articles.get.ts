export default defineEventHandler(async event => {
  await requireAdmin(event)
  const db = await getDatabase()
  const articles = await db.collection('articles').find({ deletedAt: { $exists: false }, mode: 'auction', $or: [{ closesAt: { $lte: new Date() } }, { status: 'sold' }], 'bids.0': { $exists: true } }, { projection: { title: 1, bids: 1, declinedBidderIds: 1 } }).sort({ closesAt: -1 }).toArray()
  const appointments = await (await deliveryCollection()).find({ active: true, articleId: { $in: articles.map(article => article._id) } }, { projection: { articleId: 1 } }).toArray()
  return { articles: articles.flatMap(article => {
    const bidder = rankedBidders(article.bids || [], article.declinedBidderIds || []).find(bid => !bid.declined)
    return bidder ? [{ id: String(article._id), title: String(article.title), recipientName: bidder.name, facebookUrl: bidder.facebookUrl, phone: bidder.phone, appointmentId: appointments.find(appointment => appointment.articleId?.equals(article._id))?._id.toString() || null }] : []
  }) }
})
