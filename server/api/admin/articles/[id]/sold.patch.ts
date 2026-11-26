export default defineEventHandler(async event => {
  const admin = await requireAdmin(event); checkOrigin(event)
  const articles = (await getDatabase()).collection('articles'), id = articleId(getRouterParam(event, 'id'))
  const now = new Date()
  const result = await articles.updateOne({ _id: id, deletedAt: { $exists: false }, status: { $ne: 'sold' }, 'purchases.status': { $ne: 'pending' } }, {
    $set: { status: 'sold', star: false, soldAt: now, soldBy: admin._id, updatedAt: now },
    $unset: { starSlot: '' }, $inc: { revision: 1 },
  })
  if (!result.matchedCount && await articles.findOne({ _id: id, 'purchases.status': 'pending' }, { projection: { _id: 1 } })) throw createError({ statusCode: 409, statusMessage: 'Completa o cancela las compras pendientes antes de marcar el producto como vendido.' })
  if (!result.matchedCount && !await articles.findOne({ _id: id, deletedAt: { $exists: false }, status: 'sold' }, { projection: { _id: 1 } })) throw createError({ statusCode: 404, statusMessage: 'Articulo no encontrado.' })
  return { ok: true, status: 'sold' }
})
