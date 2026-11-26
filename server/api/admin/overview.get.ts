export default defineEventHandler(async event => {
  await requireAdmin(event)
  const { mode = 'auction', types, categoryFilter } = await catalogFilters(event, 'auction')
  const db = await getDatabase()
  const articleFilter = { mode, ...categoryFilter, deletedAt: { $exists: false } }
  const articlesCollection = db.collection('articles')
  const auctionCollection = db.collection('auctions')
  const [articles, active, scheduled, closed, available, sold, recentArticles] = await Promise.all([
    articlesCollection.countDocuments(articleFilter),
    mode === 'auction' ? auctionCollection.countDocuments({ ...categoryFilter, status: 'active' }) : 0,
    mode === 'auction' ? auctionCollection.countDocuments({ ...categoryFilter, status: 'scheduled' }) : 0,
    mode === 'auction' ? auctionCollection.countDocuments({ ...categoryFilter, status: 'closed' }) : 0,
    mode === 'sale' ? articlesCollection.countDocuments({ ...articleFilter, status: 'available', active: true, units: { $gt: 0 } }) : 0,
    articlesCollection.countDocuments({ ...articleFilter, status: 'sold' }),
    articlesCollection.find(articleFilter, { projection: { title: 1, typeId: 1, category: 1, status: 1, active: 1, initialPriceCents: 1, 'photos.id': 1, closesAt: 1, star: 1, mode: 1, units: 1, discountPriceCents: 1 } }).sort({ createdAt: -1, _id: -1 }).limit(5).toArray(),
  ])
  return { mode, counts: { articles, active, scheduled, closed, available, sold }, recentArticles: recentArticles.map(item => adminRecord(item, types)) }
})
