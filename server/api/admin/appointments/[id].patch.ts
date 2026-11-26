export default defineEventHandler(async event => {
  await requireAdmin(event); checkOrigin(event)
  const collection = await deliveryCollection(), id = articleId(getRouterParam(event, 'id'))
  const existing = await collection.findOne({ _id: id, active: true })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Cita no encontrada.' })
  const input = await deliveryInput(event, existing)
  try {
    const record = await collection.findOneAndUpdate({ _id: id, active: true, revision: existing.revision }, { $set: { ...input, updatedAt: new Date() }, $inc: { revision: 1 } }, { returnDocument: 'after' })
    if (!record) throw createError({ statusCode: 409, statusMessage: 'La cita cambio. Actualiza el calendario.' })
    return deliveryDTO(record)
  } catch (error) { deliveryConflict(error) }
})
