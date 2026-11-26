import { ObjectId } from 'mongodb'
import type { ArticleDocument } from '../../../../utils/articles'
import type { PurchaseDocument } from '../../../../utils/purchases'
export default defineEventHandler(async event => {
  checkOrigin(event); limitPublicWrite(event, 'purchases', 30)
  const user = await currentBidder(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Completa tu perfil para comprar.' })
  const id = articleId(getRouterParam(event, 'id')), body = await limitedJson(event)
  if (!body || Object.keys(body).some(key => !['quantity', 'requestId', 'unitPriceCents'].includes(key)) || typeof body.quantity !== 'number' || !Number.isSafeInteger(body.quantity) || body.quantity < 1 || body.quantity > 1000000 || typeof body.unitPriceCents !== 'number' || !Number.isSafeInteger(body.unitPriceCents) || body.unitPriceCents < 1 || typeof body.requestId !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(body.requestId)) throw createError({ statusCode: 400, statusMessage: 'Selecciona una cantidad entera válida.' })
  const articles = (await getDatabase()).collection<ArticleDocument>('articles')
  for (let attempt = 0; attempt < 8; attempt++) {
    const article = await articles.findOne({ _id: id, mode: 'sale', deletedAt: { $exists: false } }, { projection: { photos: 0, bids: 0 } })
    if (!article) throw createError({ statusCode: 404, statusMessage: 'Producto no disponible.' })
    const previous = article.purchases?.find(p => p.requestId === body.requestId && p.buyer.userId.equals(user._id))
    if (previous) {
      if (previous.quantity !== body.quantity || previous.unitPriceCents !== body.unitPriceCents) throw createError({ statusCode: 409, statusMessage: 'Este intento de compra ya se usó con otros datos.' })
      return { purchase: purchaseData(previous, article) }
    }
    if (!article.active || article.status !== 'available' || (article.units ?? 0) < body.quantity) throw createError({ statusCode: 409, statusMessage: 'No hay suficientes unidades disponibles. Actualiza el producto.' })
    const unitPriceCents = salePrice(article)
    if (!unitPriceCents || unitPriceCents !== body.unitPriceCents) throw createError({ statusCode: 409, statusMessage: 'El precio cambió. Revisa el producto antes de comprar.' })
    const totalCents = unitPriceCents * body.quantity
    if (!Number.isSafeInteger(totalCents)) throw createError({ statusCode: 400, statusMessage: 'La cantidad excede el importe permitido.' })
    const types = await catalogTypes('sale'), now = new Date()
    const purchase: PurchaseDocument = {
      id: new ObjectId(), requestId: body.requestId, title: article.title, category: types.find(t => t.id === String(article.typeId))?.name || '', saleType: article.saleType || 'item',
      quantity: body.quantity, unitPriceCents, originalPriceCents: article.initialPriceCents, totalCents,
      buyer: { userId: user._id, name: user.name, facebookUrl: user.facebookUrl }, status: 'pending', createdAt: now, updatedAt: now,
    }
    // The reservation and order are one atomic document write, including on standalone MongoDB.
    const result = await articles.updateOne({ _id: id, ...articleRevision(article), active: true, status: 'available', units: { $gte: body.quantity } }, {
      $push: { purchases: purchase }, $inc: { units: -body.quantity, revision: 1 }, $set: { updatedAt: now },
    })
    if (result.matchedCount) { setResponseStatus(event, 201); return { purchase: purchaseData(purchase, article) } }
  }
  throw createError({ statusCode: 409, statusMessage: 'El inventario cambió. Reintenta la compra.' })
})
