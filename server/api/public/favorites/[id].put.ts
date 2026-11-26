import { MongoServerError } from 'mongodb'
export default defineEventHandler(async event => {
  checkOrigin(event); limitPublicWrite(event, 'favorites', 60)
  const user = await currentBidder(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Guarda tu perfil para guardar articulos.' })
  const id = articleId(getRouterParam(event, 'id')), body = await limitedJson(event)
  if (!body || typeof body.saved !== 'boolean' || Object.keys(body).some(key => key !== 'saved')) throw createError({ statusCode: 400, statusMessage: 'Seleccion de guardado no valida.' })
  if (body.saved && !await (await getDatabase()).collection('articles').findOne({ _id: id, active: true, status: { $ne: 'sold' }, deletedAt: { $exists: false } }, { projection: { _id: 1 } })) throw createError({ statusCode: 404, statusMessage: 'Articulo no disponible.' })
  const favorites = await favoriteCollection()
  if (body.saved) {
    try { await favorites.updateOne({ userId: user._id, articleId: id }, { $setOnInsert: { createdAt: new Date() } }, { upsert: true }) }
    catch (error) { if (!(error instanceof MongoServerError && error.code === 11000)) throw error }
    if (!await (await getDatabase()).collection('articles').findOne({ _id: id, deletedAt: { $exists: false } }, { projection: { _id: 1 } })) {
      await favorites.deleteOne({ userId: user._id, articleId: id })
      throw createError({ statusCode: 404, statusMessage: 'El articulo fue eliminado.' })
    }
  } else await favorites.deleteOne({ userId: user._id, articleId: id })
  return { id: String(id), saved: body.saved }
})
