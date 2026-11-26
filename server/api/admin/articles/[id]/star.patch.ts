export default defineEventHandler(async event => {
  await requireAdmin(event); checkOrigin(event)
  const body = await limitedJson(event)
  if (typeof body?.star !== 'boolean') throw createError({ statusCode: 400, statusMessage: 'Estado no valido' })
  return setFeatured(articleId(getRouterParam(event, 'id')), body.star)
})
