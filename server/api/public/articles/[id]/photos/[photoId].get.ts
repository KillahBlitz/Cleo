import type { ArticleDocument } from '../../../../../utils/articles'
export default defineEventHandler(async event => {
  const record = await (await getDatabase()).collection<ArticleDocument>('articles').findOne({ _id: articleId(getRouterParam(event, 'id')), active: true, deletedAt: { $exists: false }, status: { $ne: 'sold' } }, { projection: { photos: { $elemMatch: { id: articleId(getRouterParam(event, 'photoId')) } } } })
  const photo = record?.photos?.[0]
  if (!photo) throw createError({ statusCode: 404, statusMessage: 'Foto no disponible' })
  setHeaders(event, { 'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' })
  return send(event, Buffer.from(photo.data.buffer))
})
