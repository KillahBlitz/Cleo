import type { H3Event } from 'h3'

export async function limitedBody(event: H3Event, limit: number) {
  const length = Number(getHeader(event, 'content-length'))
  if (Number.isFinite(length) && length > limit) throw createError({ statusCode: 413, statusMessage: 'Archivo demasiado grande' })
  const stream = getRequestWebStream(event)
  if (!stream) throw createError({ statusCode: 400, statusMessage: 'Formulario vacío' })
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw createError({ statusCode: 413, statusMessage: 'Archivo demasiado grande' })
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  return Buffer.concat(chunks)
}

export async function limitedJson(event: H3Event) {
  const data = await limitedBody(event, 16 * 1024)
  try { return JSON.parse(data.toString('utf8')) as Record<string, unknown> }
  catch { throw createError({ statusCode: 400, statusMessage: 'Datos no válidos' }) }
}
