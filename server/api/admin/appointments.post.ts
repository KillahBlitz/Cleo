import { ObjectId } from 'mongodb'
export default defineEventHandler(async event => {
  const admin = await requireAdmin(event); checkOrigin(event)
  const input = await deliveryInput(event), now = new Date()
  const record = { ...input, _id: new ObjectId(), active: true, revision: 0, createdAt: now, updatedAt: now, createdBy: admin._id }
  try { await (await deliveryCollection()).insertOne(record) } catch (error) { deliveryConflict(error) }
  if (input.articleId && !await (await getDatabase()).collection('articles').findOne({ _id: input.articleId, deletedAt: { $exists: false } }, { projection: { _id: 1 } })) {
    await (await deliveryCollection()).deleteOne({ _id: record._id })
    throw createError({ statusCode: 409, statusMessage: 'El articulo fue eliminado. Vuelve a crear la cita sin vincularlo.' })
  }
  setResponseStatus(event, 201)
  return deliveryDTO(record)
})
