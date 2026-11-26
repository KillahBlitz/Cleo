import { Binary, ObjectId } from 'mongodb'
import sharp from 'sharp'
import type { H3Event } from 'h3'
import type { TypeDocument } from './catalog'
import type { CommerceMode } from '../../shared/types/admin'
import type { PurchaseDocument } from './purchases'

export interface StoredPhoto { id: ObjectId; data: Binary; contentType: string; width: number; height: number }
export interface ArticleDocument {
  _id: ObjectId
  title: string
  mode: CommerceMode
  typeId: ObjectId
  initialPriceCents: number
  currency: 'MXN'
  description: string
  active: boolean
  star: boolean
  revision?: number
  deletedAt?: Date
  soldAt?: Date
  soldBy?: ObjectId
  starSlot?: number
  bidCount?: number
  closesAt: Date | null
  saleType?: 'item' | 'package' | null
  units?: number | null
  discountPriceCents?: number | null
  purchases?: PurchaseDocument[]
  status: 'available' | 'auction' | 'sold'
  photos: StoredPhoto[]
  highestBidAmountCents: number | null
  highestBidder: { userId: ObjectId; name: string; facebookUrl?: string; email?: string; phone?: string } | null
  createdBy: ObjectId
  createdAt: Date
  updatedAt: Date
}

export function articleId(value: string | undefined) {
  if (!value || !/^[a-f\d]{24}$/i.test(value)) throw createError({ statusCode: 400, statusMessage: 'Artículo no válido' })
  return new ObjectId(value)
}

export async function newArticleInput(event: H3Event, existing?: ArticleDocument) {
  const contentType = getHeader(event, 'content-type') || ''
  if (!contentType.startsWith('multipart/form-data;')) throw createError({ statusCode: 400, statusMessage: 'Envía el formulario con las fotos' })
  const raw = await limitedBody(event, 26 * 1024 * 1024)
  let form: FormData
  try { form = await new Response(new Uint8Array(raw), { headers: { 'content-type': contentType } }).formData() }
  catch { throw createError({ statusCode: 400, statusMessage: 'Formulario no válido' }) }
  const fields = ['title', 'mode', 'typeId', 'initialPrice', 'description', 'active', 'closesAt', 'star', 'keepPhotoIds', 'saleType', 'units', 'discountPrice', 'revision']
  for (const name of form.keys()) if (!fields.includes(name) && name !== 'photos') throw createError({ statusCode: 400, statusMessage: 'Campo no permitido' })
  const text = (name: string) => {
    if (form.getAll(name).length !== 1 || typeof form.get(name) !== 'string') throw createError({ statusCode: 400, statusMessage: 'Completa los campos requeridos' })
    return String(form.get(name)).trim()
  }
  const star = form.has('star') ? text('star') : 'false'
  if (!['true', 'false'].includes(star)) throw createError({ statusCode: 400, statusMessage: 'Destacado no valido' })
  const mode = catalogMode(text('mode'))
  if (!mode) throw createError({ statusCode: 400, statusMessage: 'Selecciona la modalidad' })
  if (existing?.highestBidAmountCents != null && mode !== existing.mode) throw createError({ statusCode: 409, statusMessage: 'No puedes cambiar la modalidad cuando ya hay pujas.' })
  if (existing && (existing.mode === 'sale' || mode === 'sale') && text('revision') !== String(existing.revision ?? 0)) throw createError({ statusCode: 409, statusMessage: 'El inventario cambió. Recarga el artículo antes de guardar.' })
  if (existing?.purchases?.length && (mode !== existing.mode || text('saleType') !== existing.saleType)) throw createError({ statusCode: 409, statusMessage: 'No puedes cambiar la modalidad o el tipo de un producto con compras.' })
  let closesAt: Date | null = null
  if (mode === 'auction') {
    const closing = text('closesAt')
    closesAt = new Date(closing)
    if (!/^\d{4}-\d{2}-\d{2}T/.test(closing) || !closing.endsWith('Z') || !Number.isFinite(closesAt.getTime()) || closesAt.toISOString() !== closing || (closesAt.getTime() <= Date.now() && closesAt.toISOString() !== existing?.closesAt?.toISOString())) throw createError({ statusCode: 400, statusMessage: 'El cierre debe ser una fecha futura' })
  }
  const title = text('title'), description = text('description'), price = text('initialPrice'), active = text('active')
  if (title.length < 2 || title.length > 120) throw createError({ statusCode: 400, statusMessage: 'El nombre debe tener entre 2 y 120 caracteres' })
  if (!description || description.length > 5000) throw createError({ statusCode: 400, statusMessage: 'La descripción debe tener entre 1 y 5000 caracteres' })
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(price)) throw createError({ statusCode: 400, statusMessage: 'Precio inicial no válido' })
  const [whole, fraction = ''] = price.split('.')
  const initialPriceCents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (initialPriceCents < 1) throw createError({ statusCode: 400, statusMessage: 'El precio inicial debe ser mayor a cero' })
  if (!['true', 'false'].includes(active)) throw createError({ statusCode: 400, statusMessage: 'Estado no válido' })
  let saleType: 'item' | 'package' | null = null, units: number | null = null, discountPriceCents: number | null = null
  if (mode === 'sale') {
    const kind = text('saleType'), stock = text('units')
    if (!['item', 'package'].includes(kind)) throw createError({ statusCode: 400, statusMessage: 'Selecciona artículo o paquete.' })
    if (!/^\d{1,7}$/.test(stock) || Number(stock) > 1000000) throw createError({ statusCode: 400, statusMessage: 'Las unidades deben ser un entero entre 0 y 1000000.' })
    saleType = kind as 'item' | 'package'; units = Number(stock)
    const reserved = (existing?.purchases || []).filter(p => p.status === 'pending').reduce((sum, p) => sum + p.quantity, 0)
    if (units + reserved > 1000000) throw createError({ statusCode: 400, statusMessage: 'Las unidades disponibles y reservadas no pueden superar 1000000.' })
    if (saleType === 'package') {
      const discount = text('discountPrice')
      if (!/^\d{1,9}(\.\d{1,2})?$/.test(discount)) throw createError({ statusCode: 400, statusMessage: 'Precio de descuento no válido.' })
      const [whole, fraction = ''] = discount.split('.')
      discountPriceCents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
      if (discountPriceCents < 1 || discountPriceCents >= initialPriceCents) throw createError({ statusCode: 400, statusMessage: 'El precio de descuento debe ser mayor a cero y menor al original.' })
    }
  }
  if (mode === 'auction' && initialPriceCents % 100 !== 0 && !(existing?.mode === mode && existing.initialPriceCents === initialPriceCents)) throw createError({ statusCode: 400, statusMessage: 'El precio inicial de una subasta debe ser en pesos enteros, sin centavos.' })
  const typeId = articleId(text('typeId'))
  const db = await getDatabase()
  const category = await db.collection<TypeDocument>('types').findOne({ _id: typeId, mode, active: true })
  if (!category) throw createError({ statusCode: 400, statusMessage: 'Selecciona una categoría válida' })
  let keepPhotoIds: string[] = []
  if (form.has('keepPhotoIds')) {
    try {
      const raw = JSON.parse(text('keepPhotoIds'))
      if (!Array.isArray(raw) || raw.length > 5 || raw.some(id => typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) || new Set(raw).size !== raw.length) throw new Error()
      keepPhotoIds = raw
    } catch { throw createError({ statusCode: 400, statusMessage: 'Fotos no validas' }) }
  }
  const retained = (existing?.photos || []).filter(photo => keepPhotoIds.includes(String(photo.id)))
  if (retained.length !== keepPhotoIds.length) throw createError({ statusCode: 400, statusMessage: 'Foto no encontrada en el articulo' })
  const files = form.getAll('photos')
  if (files.length + retained.length < 1 || files.length + retained.length > 5) throw createError({ statusCode: 400, statusMessage: 'Agrega de 1 a 5 fotos' })
  const photos: StoredPhoto[] = [...retained]
  for (const file of files) {
    if (typeof file === 'string' || !file.size || file.size > 5 * 1024 * 1024) throw createError({ statusCode: 400, statusMessage: 'Cada foto debe pesar como máximo 5 MB' })
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw createError({ statusCode: 400, statusMessage: 'Usa fotos JPG, PNG o WebP' })
    const bytes = Buffer.from(await file.arrayBuffer())
    try {
      const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning' })
      const metadata = await image.metadata()
      if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || (metadata.pages || 1) > 1) throw new Error('Invalid image')
      const output = await image.rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true })
      if (output.data.length > 2 * 1024 * 1024) throw new Error('Image too large')
      photos.push({ id: new ObjectId(), data: new Binary(output.data), contentType: 'image/webp', width: output.info.width, height: output.info.height })
    } catch { throw createError({ statusCode: 400, statusMessage: 'Una foto no es válida. Usa JPG, PNG o WebP de hasta 5 MB' }) }
  }
  if (closesAt && closesAt.getTime() <= Date.now() && closesAt.toISOString() !== existing?.closesAt?.toISOString()) throw createError({ statusCode: 400, statusMessage: 'El cierre debe ser una fecha futura' })
  return { star: star === 'true', title, description, initialPriceCents, mode, typeId, active: active === 'true', closesAt, photos, saleType, units, discountPriceCents }
}

// The same gate must be used by any future auction-creation or bidding endpoint.
export async function requireAuctionableArticle(id: ObjectId) {
  const db = await getDatabase()
  const article = await db.collection<ArticleDocument>('articles').findOne({ _id: id, active: true, mode: 'auction', status: 'available', closesAt: { $gt: new Date() } }, { projection: { photos: 0 } })
  if (!article) throw createError({ statusCode: 409, statusMessage: 'El artículo no está disponible para subasta' })
  return article
}
