import { ObjectId, type Document } from 'mongodb'
import type { H3Event } from 'h3'
import type { CommerceMode, CategoryType } from '../../shared/types/admin'

export interface TypeDocument {
  _id: ObjectId
  slug: string
  name: string
  mode: CommerceMode
  active: boolean
  order: number
}

export async function catalogTypes(mode?: CommerceMode): Promise<CategoryType[]> {
  const db = await getDatabase()
  const records = await db.collection<TypeDocument>('types')
    .find({ active: true, ...(mode ? { mode } : {}) })
    .sort({ order: 1, name: 1 }).toArray()
  return records.map(record => ({ id: record._id.toHexString(), name: record.name, slug: record.slug, mode: record.mode }))
}

export function catalogMode(value: unknown, fallback?: CommerceMode): CommerceMode | undefined {
  if (value === undefined || value === '') return fallback
  if (value !== 'auction' && value !== 'sale') throw createError({ statusCode: 400, statusMessage: 'Invalid mode' })
  return value
}

export async function catalogFilters(event: H3Event, defaultMode?: CommerceMode, forcedMode?: CommerceMode) {
  const query = getQuery(event)
  const mode = catalogMode(query.mode, forcedMode || defaultMode)
  if (forcedMode && mode !== forcedMode) throw createError({ statusCode: 400, statusMessage: 'Invalid mode' })
  const types = await catalogTypes(mode)
  let typeId: ObjectId | undefined
  if (query.typeId !== undefined && query.typeId !== '') {
    if (typeof query.typeId !== 'string' || !/^[a-f\d]{24}$/i.test(query.typeId)) throw createError({ statusCode: 400, statusMessage: 'Invalid category' })
    const selected = types.find(type => type.id === String(query.typeId).toLowerCase())
    if (!selected) throw createError({ statusCode: 400, statusMessage: 'Invalid category' })
    typeId = new ObjectId(selected.id)
  }
  return { mode, types, categoryFilter: typeId ? { typeId } : {} as Document }
}
