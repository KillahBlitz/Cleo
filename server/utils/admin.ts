import { ObjectId } from 'mongodb'

interface AdminDocument {
  _id: ObjectId
  username: string
  passwordHash: string
  passwordAlgorithm: 'scrypt'
  createdAt: Date
  updatedAt: Date
}

export async function getAdminCollection() {
  const db = await getDatabase()
  return db.collection<AdminDocument>('admin')
}

export async function findSessionAdmin(id: string | undefined) {
  if (!id || !ObjectId.isValid(id)) return null
  const admins = await getAdminCollection()
  return admins.findOne({ _id: new ObjectId(id) }, { projection: { _id: 1, username: 1 } })
}
