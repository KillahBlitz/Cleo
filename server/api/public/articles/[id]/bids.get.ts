export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'no-store')
  const article = await (await getDatabase()).collection('articles').findOne({ _id: articleId(getRouterParam(event, 'id')), active: true, deletedAt: { $exists: false }, status: { $ne: 'sold' } }, { projection: { 'bids.amountCents': 1, 'bids.createdAt': 1, 'bids.bidder.name': 1 } })
  if (!article) throw createError({ statusCode: 404, statusMessage: 'Articulo no disponible' })
  return { bids: (article.bids || []).slice(-100).map((bid: any) => ({ amountCents: bid.amountCents, name: bid.bidder.name, createdAt: bid.createdAt.toISOString() })) }
})
