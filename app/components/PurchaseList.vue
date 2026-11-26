<script setup lang="ts">
import type { PurchaseList, PurchaseItem, PurchaseStatus } from '~~/shared/types/purchases'
const props = defineProps<{ admin?: boolean; articleId?: string }>()
const money = useMoney(), filter = ref(''), page = ref(1)
const query = computed(() => ({ status: filter.value || undefined, page: page.value, articleId: props.articleId || undefined }))
const { data, error, status, refresh } = await useFetch<PurchaseList>(props.admin ? '/api/admin/purchases' : '/api/public/purchases', { query })
const choices = ref<Record<string, PurchaseStatus>>({}), pending = ref(''), updateError = ref('')
const labels: Record<PurchaseStatus, string> = { pending: 'Pendiente', cancelled: 'Cancelada', completed: 'Completada' }
watch([filter, () => props.articleId], () => { page.value = 1 })
watch(data, value => { if (value && value.page > 1 && !value.items.length) page.value = Math.max(1, Math.ceil(value.total / value.pageSize)) })
async function update(item: PurchaseItem) {
  if (pending.value) return
  pending.value = item.id; updateError.value = ''
  try {
    await $fetch(`/api/admin/purchases/${item.articleId}/${item.id}`, { method: 'PATCH', body: { status: choices.value[item.id] || item.status } })
    delete choices.value[item.id]; await refresh()
  } catch (e: any) { updateError.value = [400, 404, 409].includes(e.statusCode) ? e.data?.statusMessage : 'No se pudo actualizar la compra.'; await refresh() }
  finally { pending.value = '' }
}
const date = (value: string) => new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
let timer: ReturnType<typeof setInterval>
onMounted(() => { timer = setInterval(() => { if (document.visibilityState === 'visible' && !pending.value) refresh() }, 15000) })
onBeforeUnmount(() => clearInterval(timer))
</script>
<template>
  <section class="purchases-section" :aria-busy="status === 'pending'">
    <div class="purchase-toolbar"><div><label class="sr-only" for="purchase-status">Estado de compra</label><select id="purchase-status" v-model="filter"><option value="">Todos los estados</option><option value="pending">Pendientes</option><option value="cancelled">Canceladas</option><option value="completed">Completadas</option></select></div><span v-if="data">{{ data.pending }} pendientes</span><button class="neu-button" :disabled="status === 'pending'" @click="refresh()"><AppIcon name="refresh" />Actualizar</button></div>
    <p v-if="updateError" class="error" role="alert">{{ updateError }}</p>
    <div v-if="error" class="load-error neu-surface"><p>No se pudieron cargar las compras.</p><button class="neu-button" @click="refresh()">Reintentar</button></div>
    <template v-else-if="data">
      <article v-for="item in data.items" :key="item.id" class="purchase-row neu-surface">
        <div class="purchase-summary"><span class="status-badge" :class="{ 'is-active': item.status === 'pending', 'is-sold': item.status === 'completed' }">{{ labels[item.status] }}</span><h2>{{ item.title }}</h2><p>{{ item.category }} · {{ item.saleType === 'package' ? 'Paquete' : 'Artículo' }}</p><time :datetime="item.createdAt">{{ date(item.createdAt) }} · CDMX</time><a v-if="admin && item.buyer" class="text-link purchase-contact" :href="item.buyer.facebookUrl" target="_blank" rel="noopener noreferrer">{{ item.buyer.name }}<AppIcon name="external" /></a></div>
        <dl class="purchase-amounts"><div><dt>{{ item.saleType === 'package' ? 'Paquetes' : 'Unidades' }}</dt><dd>{{ item.quantity }}</dd></div><div><dt>Precio unitario</dt><dd>{{ money(item.unitPriceCents) }}</dd></div><div><dt>Total</dt><dd>{{ money(item.totalCents) }}</dd></div></dl>
        <div class="purchase-actions"><NuxtLink v-if="admin || item.viewable" class="text-link" :to="admin ? `/panel/articulos/${item.articleId}` : `/articulos/${item.articleId}`">Ver producto<AppIcon name="chevron-right" /></NuxtLink><template v-if="admin && item.status === 'pending'"><label class="sr-only" :for="`purchase-${item.id}`">Estado de la compra de {{ item.buyer?.name }}</label><select :id="`purchase-${item.id}`" :value="choices[item.id] || item.status" :disabled="!!pending" @change="choices[item.id] = ($event.target as HTMLSelectElement).value as PurchaseStatus"><option value="pending">Pendiente</option><option value="cancelled">Cancelar compra</option><option value="completed">Completar compra</option></select><button class="neu-button primary-button" :disabled="!!pending || !choices[item.id] || choices[item.id] === item.status" @click="update(item)"><AppIcon :name="pending === item.id ? 'spinner' : 'check'" :class="{ spinning: pending === item.id }" />Guardar estado</button></template></div>
      </article>
      <div v-if="!data.items.length" class="empty-state neu-surface"><span class="empty-icon"><AppIcon name="bag" /></span><p>{{ filter ? 'Sin compras en este estado.' : 'Todavía no hay compras.' }}</p></div>
      <nav v-if="data.total > data.pageSize || page > 1" class="pagination activity-pagination" aria-label="Páginas de compras"><button class="neu-button" :disabled="page === 1 || status === 'pending'" @click="page--">Anterior</button><span>{{ page }}</span><button class="neu-button" :disabled="page * data.pageSize >= data.total || status === 'pending'" @click="page++">Siguiente</button></nav>
    </template>
  </section>
</template>
