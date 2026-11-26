export default defineEventHandler(async event => {
  const user = await currentBidder(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Completa tu perfil para consultar tus compras.' })
  return listPurchases(event, user._id)
})
