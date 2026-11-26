export default defineEventHandler(async event => {
  await requireAdmin(event); checkOrigin(event)
  const db = await getDatabase(), id = articleId(getRouterParam(event, 'id'))
  // Photos and bids are embedded, so removing the document removes them too.
  // Keep this idempotent so interrupted cleanup can be retried on standalone MongoDB.
  await db.collection('articles').deleteOne({ _id: id })
  await db.collection('favorites').deleteMany({ articleId: id })
  await db.collection('auctions').deleteMany({ articleId: id })
  // A previously agreed appointment remains a separate calendar commitment.
  await db.collection('appointments').updateMany({ articleId: id }, { $set: { articleId: null, articleTitle: '', updatedAt: new Date() }, $inc: { revision: 1 } })
  return { ok: true }
})
