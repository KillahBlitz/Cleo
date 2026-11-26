export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'no-store')
  const article = await (await getDatabase()).collection('articles').findOne({ _id: articleId(getRouterParam(event, 'id')), active: true, deletedAt: { $exists: false }, status: { $ne: 'sold' } }, { projection: publicArticleProjection })
  if (!article) throw createError({ statusCode: 404, statusMessage: 'Articulo no disponible' })
  return { article: storeArticle(article, await catalogTypes()) }
})
