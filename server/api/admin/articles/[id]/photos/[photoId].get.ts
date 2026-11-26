import type { ArticleDocument } from '../../../../../utils/articles'
export default defineEventHandler(async event => {
  await requireAdmin(event)
  const db = await getDatabase()
  const id = articleId(getRouterParam(event, 'id')), photoId = articleId(getRouterParam(event, 'photoId'))
  const record = await db.collection<ArticleDocument>('articles').findOne({ _id: id, deletedAt: { $exists: false } }, { projection: { photos: { $elemMatch: { id: photoId } } } })
  const photo = record?.photos?.[0]
  if (!photo) throw createError({ statusCode: 404, statusMessage: 'Foto no encontrada' })
  setHeader(event, 'Content-Type', photo.contentType)
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  return send(event, Buffer.from(photo.data.buffer))
})
