<script setup lang="ts">
import type { CategoryType, CommerceMode, ArticleDetail } from '~~/shared/types/admin'
const props = defineProps<{ article?: ArticleDetail }>()
const hasBids = computed(() => props.article?.highestBidAmountCents != null)
const hasPurchases = computed(() => !!props.article?.purchaseCount)
const saleType = ref(props.article?.saleType || 'item'), units = ref(String(props.article?.units ?? 1)), discountPrice = ref(props.article?.discountPriceCents != null ? String(props.article.discountPriceCents / 100) : '')
const route = useRoute()
const title = ref(props.article?.title || ''), price = ref(props.article?.initialPriceCents != null ? String(props.article.initialPriceCents / 100) : ''), description = ref(props.article?.description || ''), active = ref(props.article?.active === false ? 'false' : 'true'), closesAt = ref(''), star = ref(props.article?.star || false)
const originalClosing = ref('')
onMounted(() => { if (props.article?.closesAt) { const d = new Date(props.article.closesAt); originalClosing.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); closesAt.value = originalClosing.value } })
const savedPhotos = ref(props.article?.photos.map(photo => ({ ...photo })) || [])
const mode = ref<CommerceMode>(props.article?.mode || (route.query.modalidad === 'sale' ? 'sale' : 'auction'))
const category = ref(props.article?.typeId || (typeof route.query.categoria === 'string' ? route.query.categoria : ''))
const typeQuery = computed(() => ({ mode: mode.value }))
const { data: catalog, error: catalogError, refresh: refreshCatalog } = await useFetch<{ types: CategoryType[] }>('/api/admin/types', { query: typeQuery })
watch(mode, () => { category.value = '' })
const photos = ref<{ file: File; preview: string }[]>([])
const pending = ref(false), error = ref(''), photoError = ref('')
const fileInput = ref<HTMLInputElement>()
function addPhotos(files: FileList | File[]) {
  photoError.value = ''
  const incoming = Array.from(files)
  if (savedPhotos.value.length + photos.value.length + incoming.length > 5) { photoError.value = 'Puedes agregar un máximo de 5 fotos.'; return }
  if (incoming.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024)) { photoError.value = 'Usa JPG, PNG o WebP de hasta 5 MB por foto.'; return }
  photos.value.push(...incoming.map(file => ({ file, preview: URL.createObjectURL(file) })))
}
function selectFiles(event: Event) { const input = event.target as HTMLInputElement; if (input.files) addPhotos(input.files); input.value = '' }
function dropFiles(event: DragEvent) { if (!pending.value && event.dataTransfer?.files) addPhotos(event.dataTransfer.files) }
function removePhoto(index: number) { const photo = photos.value.splice(index, 1)[0]; if (photo) URL.revokeObjectURL(photo.preview) }
onBeforeUnmount(() => photos.value.forEach(photo => URL.revokeObjectURL(photo.preview)))
async function save() {
  if (pending.value) return
  error.value = ''; photoError.value = ''
  if (!photos.value.length && !savedPhotos.value.length) { photoError.value = 'Agrega al menos una foto.'; fileInput.value?.focus(); return }
  const closing = new Date(props.article?.closesAt && closesAt.value === originalClosing.value ? props.article.closesAt : closesAt.value)
  if (mode.value === 'auction' && (!Number.isFinite(closing.getTime()) || (closing.getTime() <= Date.now() && closing.toISOString() !== props.article?.closesAt))) { error.value = 'El cierre debe ser una fecha futura.'; return }
  const form = new FormData()
  for (const [key, value] of Object.entries({ title: title.value, mode: mode.value, typeId: category.value, initialPrice: price.value, description: description.value, active: active.value, star: String(star.value), closesAt: mode.value === 'auction' ? closing.toISOString() : '', ...(mode.value === 'sale' ? { saleType: saleType.value, units: units.value, discountPrice: discountPrice.value } : {}), ...(props.article ? { revision: String(props.article.revision) } : {}) })) form.append(key, value)
  form.append('keepPhotoIds', JSON.stringify(savedPhotos.value.map(photo => photo.id)))
  photos.value.forEach(photo => form.append('photos', photo.file))
  pending.value = true
  try {
    const result = await $fetch<{ id: string }>(props.article ? `/api/admin/articles/${props.article.id}` : '/api/admin/articles', { method: props.article ? 'PATCH' : 'POST', body: form })
    await refreshNuxtData()
    await navigateTo(`/panel/articulos/${result.id}`)
  } catch (e: any) {
    error.value = [400, 409].includes(e.statusCode) ? (e.data?.statusMessage || 'Revisa los datos y las fotos.') : e.statusCode === 413 ? 'Las fotos exceden el tamaño permitido.' : 'No se pudo guardar el artículo.'
  } finally { pending.value = false }
}
</script>
<template>
  <div class="admin-page">
  <div class="page-heading"><h1>{{ article ? 'Editar artículo' : 'Nuevo artículo' }}</h1><NuxtLink class="neu-button" :to="{ path: '/panel/articulos', query: { modalidad: mode, categoria: category || undefined } }">Volver</NuxtLink></div>
  <form class="admin-form article-form neu-surface" :aria-busy="pending" @submit.prevent="save"><fieldset :disabled="pending">
    <div class="form-grid">
      <div class="form-field form-full"><label for="article-name">Nombre del artículo</label><input id="article-name" v-model="title" required minlength="2" maxlength="120" autocomplete="off" /></div>
      <div class="form-field"><label for="article-mode">Modalidad</label><select id="article-mode" v-model="mode" :disabled="hasBids || hasPurchases"><option value="auction">Subasta</option><option value="sale">Venta</option></select></div>
      <div class="form-field"><label for="article-category">Categoría</label><select id="article-category" v-model="category" required :disabled="!!catalogError || hasBids"><option value="" disabled>Selecciona una categoría</option><option v-for="type in catalog?.types || []" :key="type.id" :value="type.id">{{ type.name }}</option></select><button v-if="catalogError" class="text-link retry-link" type="button" @click="refreshCatalog()">Reintentar categorías</button><p v-else-if="!catalog?.types.length" class="field-hint">Agrega una categoría desde Resumen.</p></div>
      <div v-if="mode === 'sale'" class="form-field"><label for="sale-type">Tipo</label><select id="sale-type" v-model="saleType" :disabled="hasPurchases"><option value="item">Artículo</option><option value="package">Paquete</option></select></div>
      <div v-if="mode === 'sale'" class="form-field"><label for="sale-units">{{ saleType === 'package' ? 'Paquetes disponibles' : 'Unidades disponibles' }}</label><input id="sale-units" v-model="units" type="number" min="0" :max="1000000 - (article?.reservedUnits || 0)" step="1" inputmode="numeric" required /><p v-if="article?.reservedUnits" class="field-hint">{{ article.reservedUnits }} reservadas en compras pendientes.</p></div>
      <div class="form-field"><label for="article-price">{{ mode === 'sale' ? 'Precio fijo (MXN)' : 'Precio inicial (MXN)' }}</label><input id="article-price" v-model="price" :readonly="hasBids" type="number" :inputmode="mode === 'auction' ? 'numeric' : 'decimal'" required :min="mode === 'auction' ? 1 : 0.01" :max="mode === 'auction' ? 999999999 : 999999999.99" :step="mode === 'auction' && !(article?.initialPriceCents && article.initialPriceCents % 100) ? 1 : 0.01" :placeholder="mode === 'auction' ? '0' : '0.00'" /></div>
      <div v-if="mode === 'sale' && saleType === 'package'" class="form-field"><label for="discount-price">Precio con descuento (MXN)</label><input id="discount-price" v-model="discountPrice" type="number" min="0.01" :max="Number(price) - 0.01" step="0.01" inputmode="decimal" required /></div>
      <div class="form-field"><label for="article-active">Estado</label><select id="article-active" v-model="active"><option value="true">Activo</option><option value="false">Inactivo</option></select><p v-if="article?.status === 'sold'" class="field-hint">Vendido · Solo visible en administración e historial.</p></div>
      <div v-if="article?.status !== 'sold'" class="form-field form-full"><FeaturedCheckbox v-model="star" /></div>
      <div v-if="mode === 'auction'" class="form-field form-full"><label for="article-closing">{{ mode === 'auction' ? 'Cierre de subasta' : 'Fecha límite de venta' }}</label><input id="article-closing" v-model="closesAt" :readonly="hasBids" type="datetime-local" required /><p class="field-hint">{{ hasBids ? 'Precio, categoría y cierre fijos porque ya hay pujas.' : 'Fecha y hora local.' }}</p></div>
      <div class="form-field form-full"><label for="article-description">Descripción</label><textarea id="article-description" v-model="description" required maxlength="5000" rows="5" /></div>
    </div>
    <div class="photo-heading"><label for="article-photos">Fotos</label><span>{{ photos.length + savedPhotos.length }}/5</span></div>
    <div class="photo-drop" @dragover.prevent @drop.prevent="dropFiles"><AppIcon name="image" /><label class="neu-button" for="article-photos">Agregar fotos</label><input id="article-photos" ref="fileInput" class="photo-file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple :disabled="pending || photos.length + savedPhotos.length === 5" @change="selectFiles" /><p class="field-hint">JPG, PNG o WebP · Máximo 5 MB por foto</p></div>
    <div v-if="photos.length + savedPhotos.length" class="photo-previews"><div v-for="(photo, index) in savedPhotos" :key="photo.id" class="photo-preview"><img :src="photo.url" :alt="`Foto guardada ${index + 1}`" /><button class="neu-button icon-button" type="button" :aria-label="`Quitar foto guardada ${index + 1}`" @click="savedPhotos.splice(index, 1)"><AppIcon name="close" /></button></div><div v-for="(photo, index) in photos" :key="photo.preview" class="photo-preview"><img :src="photo.preview" :alt="`Foto ${index + 1}`" /><button class="neu-button icon-button" type="button" :aria-label="`Quitar foto ${index + 1}`" @click="removePhoto(index)"><AppIcon name="close" /></button></div></div>
    <p v-if="photoError" class="error" role="alert">{{ photoError }}</p><p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="form-actions"><button class="neu-button primary-button" type="submit"><AppIcon :name="pending ? 'spinner' : 'check'" :class="{ spinning: pending }" />{{ pending ? 'Guardando…' : article ? 'Guardar cambios' : 'Guardar artículo' }}</button></div>
  </fieldset></form>
  </div>
</template>
