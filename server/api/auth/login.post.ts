// A valid dummy hash keeps unknown usernames on the same password-verification path.
const dummyHash = `${'0'.repeat(32)}:${'0'.repeat(128)}`

export default defineEventHandler(async event => {
  checkOrigin(event)
  const resetAttempts = limitLogin(event)
  const body = await readBody(event)
  if (!body || typeof body.username !== 'string' || typeof body.password !== 'string' || body.username.length > 100 || body.password.length > 256) throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  const admins = await getAdminCollection()
  const admin = await admins.findOne({ username: body.username })
  const hash = admin?.passwordAlgorithm === 'scrypt' && typeof admin.passwordHash === 'string' ? admin.passwordHash : dummyHash
  const validPassword = verifyPassword(body.password, hash)
  if (!admin || !validPassword || admin.passwordAlgorithm !== 'scrypt') throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  const session = await adminSession(event)
  await session.clear()
  await session.update({ adminId: admin._id.toHexString() })
  resetAttempts()
  return { user: admin.username }
})
