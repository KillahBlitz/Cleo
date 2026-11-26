import type { ArticleDocument } from '../../../utils/articles'
export default defineEventHandler(async event => {
  await requireAdmin(event); checkOrigin(event)
  const id = articleId(getRouterParam(event, 'id'))
  const existing = await (await getDatabase()).collection<ArticleDocument>('articles').findOne({ _id: id, deletedAt: { $exists: false } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Articulo no encontrado' })
  const input = await newArticleInput(event, existing)
  if (existing.highestBidAmountCents != null && (input.initialPriceCents !== existing.initialPriceCents || input.mode !== existing.mode || String(input.typeId) !== String(existing.typeId) || input.closesAt?.getTime() !== existing.closesAt?.getTime())) throw createError({ statusCode: 409, statusMessage: 'No puedes cambiar precio, modalidad, categoria o cierre cuando ya hay pujas.' })
  await updateArticleRecord(id, input, articleRevision(existing))
  return { id: String(id) }
})
