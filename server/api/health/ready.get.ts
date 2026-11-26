import { getDatabase } from '../../utils/mongodb'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  try {
    if (useRuntimeConfig(event).sessionPassword.length < 32) throw new Error('Configuration')
    const db = await getDatabase()
    // Also checks authentication and read permission on the actual application DB.
    await db.collection('admin').findOne({}, { projection: { _id: 1 }, timeoutMS: 2500 })
    return { status: 'ok' }
  } catch {
    setResponseStatus(event, 503)
    return { status: 'unavailable' }
  }
})
