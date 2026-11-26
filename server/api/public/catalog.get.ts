export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'no-store')
  const { mode = 'auction', types, categoryFilter } = await catalogFilters(event, 'auction')
  const query = getQuery(event), page = Math.max(1, Math.min(10000, Number.parseInt(String(query.page || '1'), 10) || 1))
  const articles = (await getDatabase()).collection('articles')
  const filter = { active: true, mode, ...categoryFilter, status: { $in: ['available', 'auction'] }, deletedAt: { $exists: false }, ...(mode === 'auction' ? { closesAt: { $gt: new Date() } } : { units: { $gt: 0 } }) }
  const [items, featured, total] = await Promise.all([
    articles.find(filter, { projection: publicArticleProjection }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 12).limit(12).toArray(),
    articles.find({ ...filter, star: true }, { projection: publicArticleProjection }).sort({ starSlot: 1 }).limit(5).toArray(),
    articles.countDocuments(filter),
  ])
  return { items: items.map(item => storeArticle(item, types)), featured: featured.map(item => storeArticle(item, types)), total, page, pageSize: 12, types }
})
