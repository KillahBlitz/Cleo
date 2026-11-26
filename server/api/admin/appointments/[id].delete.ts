export default defineEventHandler(async event => {
  const admin = await requireAdmin(event); checkOrigin(event)
  const id = articleId(getRouterParam(event, 'id')), body = await limitedJson(event)
  if (!Number.isSafeInteger(body?.revision) || Number(body.revision) < 0) throw createError({ statusCode: 400, statusMessage: 'Version de cita no valida.' })
  const result = await (await deliveryCollection()).updateOne({ _id: id, active: true, revision: Number(body.revision) }, { $set: { active: false, deletedAt: new Date(), deletedBy: admin._id, updatedAt: new Date() }, $inc: { revision: 1 } })
  if (!result.matchedCount) throw createError({ statusCode: 409, statusMessage: 'La cita cambio o ya fue eliminada. Actualiza el calendario.' })
  return { ok: true }
})
