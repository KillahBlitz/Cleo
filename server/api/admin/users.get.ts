export default defineEventHandler(async event => {
  await requireAdmin(event)
  const users = await (await getDatabase()).collection('users').find({ kind: 'bidder' }, { projection: { name: 1, facebookUrl: 1, phone: 1 } }).sort({ updatedAt: -1 }).limit(200).toArray()
  return { users: users.map(user => ({ id: String(user._id), name: user.name, facebookUrl: user.facebookUrl || '', phone: user.phone || '' })) }
})
