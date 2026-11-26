import { MongoServerError, ObjectId, type Document } from 'mongodb'
import type { ArticleDocument } from './articles'
async function featuredCollection() {
  const articles = (await getDatabase()).collection<ArticleDocument>('articles')
  await articles.createIndex({ starSlot: 1 }, { unique: true, partialFilterExpression: { star: true }, name: 'five_manual_featured_slots' })
  return articles
}
export async function insertArticle(article: ArticleDocument) {
  const articles = await featuredCollection()
  if (!article.star) { await articles.insertOne(article); return }
  for (let slot = 1; slot <= 5; slot++) {
    try { await articles.insertOne({ ...article, starSlot: slot }); return }
    catch (error) { if (!(error instanceof MongoServerError && error.code === 11000)) throw error }
  }
  throw createError({ statusCode: 409, statusMessage: 'Ya hay 5 articulos destacados. Retira uno antes de agregar otro.' })
}
export function articleRevision(article: ArticleDocument) {
  return { revision: article.revision === undefined ? { $exists: false } : article.revision }
}
export async function updateArticleRecord(id: ObjectId, changes: Partial<ArticleDocument>, expected?: Document) {
  const articles = await featuredCollection()
  const current = await articles.findOne({ _id: id, deletedAt: { $exists: false } }, { projection: { star: 1, starSlot: 1, revision: 1, status: 1 } })
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Articulo no encontrado' })
  const star = changes.star ?? current.star
  if (current.status === 'sold' && star) throw createError({ statusCode: 409, statusMessage: 'Un articulo vendido no puede destacarse.' })
  const slots = star && !current.star ? [1, 2, 3, 4, 5] : [current.starSlot]
  for (const slot of slots) {
    try {
      const result = await articles.updateOne({ _id: id, deletedAt: { $exists: false }, ...(expected || articleRevision(current)) }, {
        $set: { ...changes, star, ...(star ? { starSlot: slot } : {}), updatedAt: new Date() },
        ...(!star ? { $unset: { starSlot: '' as const } } : {}), $inc: { revision: 1 },
      })
      if (!result.matchedCount) throw createError({ statusCode: 409, statusMessage: 'El articulo cambio. Recarga antes de guardar.' })
      return { star }
    } catch (error) { if (!(error instanceof MongoServerError && error.code === 11000)) throw error }
  }
  throw createError({ statusCode: 409, statusMessage: 'Solo puedes destacar 5 articulos.' })
}
export function setFeatured(id: ObjectId, star: boolean) { return updateArticleRecord(id, { star }) }
