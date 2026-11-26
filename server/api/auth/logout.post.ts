export default defineEventHandler(async event => {
  checkOrigin(event)
  const session = await adminSession(event)
  await session.clear()
  deleteCookie(event, 'cleo-session', { path: '/', httpOnly: true, sameSite: 'strict', secure: !import.meta.dev })
  return { ok: true }
})