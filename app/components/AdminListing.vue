<script setup lang="ts">
import type { AdminList, CommerceMode } from '~~/shared/types/admin'
const props = defineProps<{ kind: 'articles' | 'auctions'; eligible?: boolean }>()
const route = useRoute(), router = useRouter()
const isArticle = props.kind === 'articles'
const isInventory = isArticle && !props.eligible
const options = isArticle ? [{ value: 'active', label: 'Activo' }, { value: 'inactive', label: 'Inactivo' }, { value: 'draft', label: 'Borrador' }, { value: 'available', label: 'Disponible' }, { value: 'auction', label: 'En subasta' }, { value: 'sold', label: 'Vendido' }] : [{ value: 'draft', label: 'Borrador' }, { value: 'scheduled', label: 'Programada' }, { value: 'active', label: 'Activa' }, { value: 'closed', label: 'Finalizada' }]
const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
function updateQuery(key: string, value: string, resetCategory = false) {
  router.replace({ query: { ...route.query, [key]: value || undefined, pagina: undefined, ...(resetCategory ? { categoria: undefined } : {}) } })
}
const filter = computed({ get: () => options.some(o => o.value === route.query.estado) ? String(route.query.estado) : '', set: value => updateQuery('estado', value) })
const mode = computed<CommerceMode | ''>({
  get: () => !isArticle || props.eligible ? 'auction' : route.query.modalidad === 'auction' || route.query.modalidad === 'sale' ? route.query.modalidad : '',
  set: value => updateQuery('modalidad', value, true),
})
const category = computed({ get: () => typeof route.query.categoria === 'string' ? route.query.categoria : '', set: value => updateQuery('categoria', value) })
const page = computed(() => Math.max(1, Number.parseInt(String(route.query.pagina || '1'), 10) || 1))
const query = computed(() => ({ q: typeof route.query.q === 'string' ? route.query.q : '', status: filter.value, page: page.value, mode: mode.value || undefined, typeId: category.value || undefined }))
const { data, status, error, refresh } = await useFetch<AdminList>(`/api/admin/${props.eligible ? 'auction-eligible' : props.kind}`, { query })
watch(() => route.query.q, q => { search.value = typeof q === 'string' ? q : '' })
function find() { updateQuery('q', search.value.trim()) }
function changePage(next: number) { router.replace({ query: { ...route.query, pagina: next > 1 ? next : undefined } }) }
</script>
<template>
  <div class="admin-page">
  <div class="page-heading"><h1>{{ isInventory ? 'Artículos' : 'Subastas' }}</h1><div class="heading-actions"><NuxtLink v-if="isInventory" class="neu-button primary-button" :to="{ path: '/panel/articulos/nuevo', query: { modalidad: mode || 'auction', categoria: category || undefined } }"><AppIcon name="plus" />Nuevo artículo</NuxtLink><button class="neu-button" :disabled="status === 'pending'" @click="refresh()"><AppIcon name="refresh" :class="{ spinning: status === 'pending' }" />Actualizar</button></div></div>
  <nav v-if="!isInventory" class="section-tabs" aria-label="Subastas"><NuxtLink :class="{ selected: !eligible }" :to="{ path: '/panel/subastas', query: { categoria: category || undefined } }">Subastas</NuxtLink><NuxtLink :class="{ selected: eligible }" :to="{ path: '/panel/subastas', query: { vista: 'articulos', categoria: category || undefined } }">Artículos disponibles</NuxtLink></nav>
  <section class="data-card neu-surface" :aria-busy="status === 'pending'">
    <div class="list-toolbar">
      <form class="search-form" role="search" @submit.prevent="find"><label class="sr-only" for="record-search">Buscar por nombre</label><div class="search-input"><AppIcon name="search" /><input id="record-search" v-model="search" placeholder="Buscar por nombre" type="search" maxlength="100" /></div><button class="neu-button" type="submit">Buscar</button></form>
      <div class="list-filters">
        <template v-if="isInventory"><label class="sr-only" for="record-mode">Modalidad</label><select id="record-mode" v-model="mode"><option value="">Todas las modalidades</option><option value="auction">Subastas</option><option value="sale">Ventas</option></select></template>
        <CategoryFilter v-model="category" :mode="mode || undefined" />
        <label v-if="!eligible" class="sr-only" for="record-status">Estado</label><select v-if="!eligible" id="record-status" v-model="filter"><option value="">Todos los estados</option><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select>
      </div>
    </div>
    <div v-if="error" class="load-error" role="alert"><p>No se pudieron cargar los datos.</p><button class="neu-button" @click="refresh()">Reintentar</button></div>
    <p v-else-if="status === 'pending'" class="loading-state" role="status">Cargando…</p>
    <AdminRecords v-else :items="data?.items || []" :empty-text="query.q || filter || category ? 'Sin resultados' : eligible ? 'Sin artículos disponibles' : isArticle ? 'Sin artículos registrados' : 'Sin subastas registradas'" :articles="isArticle" :icon="isArticle ? 'box' : 'gavel'" />
    <div v-if="data && !error && status !== 'pending'" class="list-footer"><span>{{ data.total }} {{ data.total === 1 ? 'registro' : 'registros' }}</span><div class="pagination" v-if="data.total > data.pageSize || page > 1"><button class="neu-button icon-button" aria-label="Página anterior" :disabled="page === 1" @click="changePage(page - 1)"><AppIcon name="chevron-left" /></button><span>{{ page }}</span><button class="neu-button icon-button" aria-label="Página siguiente" :disabled="page * data.pageSize >= data.total" @click="changePage(page + 1)"><AppIcon name="chevron-right" /></button></div></div>
  </section>
  </div>
</template>
