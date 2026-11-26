export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'no-store')
  const session = await adminSession(event)
  const admin = await findSessionAdmin(session.data.adminId)
  return { user: admin?.username ?? null }
})
