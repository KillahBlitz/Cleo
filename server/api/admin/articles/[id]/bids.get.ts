export default defineEventHandler(async event => {
  await requireAdmin(event)
  const article = await (await getDatabase()).collection('articles').findOne({ _id: articleId(getRouterParam(event, 'id')), deletedAt: { $exists: false } }, { projection: { bids: 1, declinedBidderIds: 1, closesAt: 1, status: 1 } })
  if (!article) throw createError({ statusCode: 404, statusMessage: 'Articulo no encontrado' })
  return { bids: article.bids || [], ranking: rankedBidders(article.bids || [], article.declinedBidderIds || []), closed: article.status === 'sold' || article.closesAt <= new Date() }
})
