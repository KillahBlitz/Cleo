export default defineEventHandler(async event => {
  await requireAdmin(event)
  const mode = catalogMode(getQuery(event).mode)
  return { types: await catalogTypes(mode) }
})
