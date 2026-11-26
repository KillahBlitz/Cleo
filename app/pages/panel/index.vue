<script setup lang="ts">
import type { AdminOverview, CommerceMode, CategoryType } from '~~/shared/types/admin'
import type { IconName } from '~/components/AppIcon.vue'
useHead({ title: 'Resumen · Cleo' })
const route = useRoute(), router = useRouter()
const mode = computed<CommerceMode>(() => route.query.modalidad === 'sale' ? 'sale' : 'auction')
const category = computed({
  get: () => typeof route.query.categoria === 'string' ? route.query.categoria : '',
  set: value => { router.replace({ query: { ...route.query, categoria: value || undefined } }) },
})
function categoryCreated(type: CategoryType) { router.replace({ query: { modalidad: type.mode, categoria: type.id } }) }
function selectMode(value: CommerceMode) {
  router.replace({ query: { ...route.query, modalidad: value, categoria: undefined } })
}
const query = computed(() => ({ mode: mode.value, typeId: category.value || undefined }))
const { data, status, error, refresh } = await useFetch<AdminOverview>('/api/admin/overview', { query })
type Metric = { key: keyof AdminOverview['counts']; label: string; icon: IconName; path: string; state?: string }
const metrics = computed<Metric[]>(() => mode.value === 'auction' ? [
  { key: 'articles', label: 'Artículos', icon: 'box', path: '/panel/articulos' },
  { key: 'active', label: 'Subastas activas', icon: 'gavel', path: '/panel/subastas', state: 'active' },
  { key: 'scheduled', label: 'Programadas', icon: 'clock', path: '/panel/subastas', state: 'scheduled' },
  { key: 'closed', label: 'Finalizadas', icon: 'check', path: '/panel/subastas', state: 'closed' },
] : [
  { key: 'articles', label: 'Artículos', icon: 'box', path: '/panel/articulos' },
  { key: 'available', label: 'Disponibles', icon: 'bag', path: '/panel/articulos', state: 'available' },
  { key: 'sold', label: 'Vendidos', icon: 'check', path: '/panel/articulos', state: 'sold' },
])
function destination(path: string, state?: string) {
  return { path, query: { modalidad: mode.value, categoria: category.value || undefined, estado: state } }
}
</script>
<template>
  <div class="admin-page">
  <div class="page-heading"><h1>Resumen</h1><div class="heading-actions"><NuxtLink v-if="mode === 'sale'" class="neu-button" to="/panel/ventas"><AppIcon name="bag" />Compras</NuxtLink><CategoryCreate :mode="mode" @created="categoryCreated" /><button class="neu-button" :disabled="status === 'pending'" @click="refresh()"><AppIcon name="refresh" :class="{ spinning: status === 'pending' }" />Actualizar</button></div></div>
  <div class="overview-filters">
    <div class="mode-switch" role="group" aria-label="Modalidad">
      <button type="button" :aria-pressed="mode === 'auction'" :class="{ selected: mode === 'auction' }" @click="selectMode('auction')"><AppIcon name="gavel" />Subastas</button>
      <button type="button" :aria-pressed="mode === 'sale'" :class="{ selected: mode === 'sale' }" @click="selectMode('sale')"><AppIcon name="bag" />Ventas</button>
    </div>
    <CategoryFilter v-model="category" :mode="mode" />
  </div>
  <div v-if="error" class="load-error neu-surface" role="alert"><p>No se pudo cargar el resumen.</p><button class="neu-button" @click="refresh()">Reintentar</button></div>
  <template v-else>
    <div class="metric-grid" :class="{ 'sales-metrics': mode === 'sale' }" :aria-busy="status === 'pending'"><NuxtLink v-for="metric in metrics" :key="metric.key" class="metric-card neu-surface" :to="destination(metric.path, metric.state)"><div class="metric-top"><span class="metric-icon"><AppIcon :name="metric.icon" /></span><AppIcon class="metric-chevron" name="chevron-right" /></div><strong>{{ status === 'pending' ? '—' : data?.counts[metric.key] ?? '—' }}</strong><span>{{ metric.label }}</span></NuxtLink></div>
    <section class="data-card neu-surface"><div class="card-heading"><h2>Últimos artículos</h2><NuxtLink class="text-link" :to="destination('/panel/articulos')">Ver todos<AppIcon name="chevron-right" /></NuxtLink></div><p v-if="status === 'pending'" class="loading-state" role="status">Cargando…</p><AdminRecords v-else :items="data?.recentArticles || []" :empty-text="category ? 'Sin artículos en esta categoría' : 'Sin artículos registrados'" icon="box" articles /></section>
  </template>
  </div>
</template>
