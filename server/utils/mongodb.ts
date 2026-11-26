import { MongoClient } from 'mongodb'
let connection: Promise<MongoClient> | undefined
export async function getDatabase() {
  const config = useRuntimeConfig()
  const uri = process.env.MONGODB_URI || config.mongodbUri
  if (!uri) throw createError({ statusCode: 503, statusMessage: 'MongoDB is not configured' })
  if (!connection) connection = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 }).connect().catch(error => { connection = undefined; throw error })
  return (await connection).db(config.mongodbDatabase)
}
