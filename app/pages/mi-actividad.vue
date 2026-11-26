<script setup lang="ts">
import type { ActivityItem, ActivityStatus, ActivityTab, PersonalActivity } from '~~/shared/types/activity'
import type { BidderProfile } from '~~/shared/types/store'
useHead({ title: 'Mi actividad · Cleo', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })
if (import.meta.server) useResponseHeader('Cache-Control').value = 'private, no-store'
const route = useRoute(), router = useRouter(), money = useMoney()
type PersonalTab = ActivityTab | 'purchases'
const tabs = [{ key: 'purchases' as const, label: 'Mis compras', query: 'compras' }, { key: 'bids' as const, label: 'Mis pujas', query: 'pujas' }, { key: 'saved' as const, label: 'Guardados', query: 'guardados' }, { key: 'opportunities' as const, label: 'Segundas oportunidades', query: 'oportunidades' }]
const tab = computed<PersonalTab>(() => tabs.find(item => item.query === route.query.vista)?.key || 'bids')
const page = computed(() => Math.min(999999, Math.max(1, Number.parseInt(String(route.query.pagina || '1'), 10) || 1)))
const { data, error, status, refresh } = await useFetch<PersonalActivity>('/api/public/activity', { key: 'personal-activity', query: computed(() => ({ tab: tab.value === 'purchases' ? 'bids' : tab.value, page: page.value })) })
const { data: profile } = useNuxtData<{ profile: BidderProfile | null }>('bidder-profile')
const profileOpen = useState<boolean>('profile-dialog-open', () => false)
const now = ref(data.value?.now ? Date.parse(data.value.now) : 0)
let received = Date.now(), serverNow = now.value
watch(() => data.value?.now, value => { if (value) { received = Date.now(); serverNow = Date.parse(value); now.value = serverNow } })
watch(() => profile.value?.profile?.id, (id, previous) => { if (id !== previous) refresh() })
const activeCount = computed(() => data.value?.activeClosesAt.filter(date => Date.parse(date) > now.value).length || 0)
const unauthenticated = computed(() => error.value?.statusCode === 401)
const rows = computed(() => data.value?.tab === tab.value ? data.value.items : [])
const statusLabels: Record<ActivityStatus, string> = { leading: 'Vas ganando', outbid: 'Superaron tu oferta', highest: 'Terminó con tu mejor oferta', opportunity: 'Es tu turno', waiting: 'Finalizada · En espera', declined: 'Sin acuerdo', unavailable: 'No disponible', ended: 'Finalizada', available: 'Disponible', sold: 'Vendido' }
function itemStatus(item: ActivityItem) { return ['leading', 'outbid', 'available'].includes(item.status) && item.closesAt && Date.parse(item.closesAt) <= now.value ? item.closedStatus : item.status }
function changeTab(value: PersonalTab) { router.replace({ query: { ...route.query, vista: tabs.find(item => item.key === value)?.query, pagina: undefined } }) }
function changePage(value: number) { router.replace({ query: { ...route.query, pagina: value > 1 ? String(value) : undefined } }) }
watch(data, value => { if (value && value.page > 1 && !value.items.length) changePage(Math.max(1, Math.ceil(value.total / value.pageSize))) })
const empty = computed(() => tab.value === 'saved' ? 'Guarda los artículos que te gusten con el corazón.' : tab.value === 'opportunities' ? 'Aquí aparecerán los artículos cuando te corresponda el siguiente turno.' : 'Aún no has participado en una subasta.')
let poll: ReturnType<typeof setInterval>, clock: ReturnType<typeof setInterval>
function visibleRefresh() { if (document.visibilityState === 'visible') refresh() }
onMounted(() => { poll = setInterval(visibleRefresh, 15_000); clock = setInterval(() => { now.value = serverNow + Date.now() - received }, 1000); document.addEventListener('visibilitychange', visibleRefresh) })
onBeforeUnmount(() => { clearInterval(poll); clearInterval(clock); document.removeEventListener('visibilitychange', visibleRefresh) })
</script>
<template>
  <div class="store-container activity-page">
    <div class="activity-heading"><div><span class="category-label">TU ESPACIO EN CLEO</span><h1>Mi actividad</h1></div><NuxtLink class="neu-button" to="/"><AppIcon name="box" />Explorar artículos</NuxtLink></div>
    <section v-if="unauthenticated" class="activity-welcome neu-surface"><span class="empty-icon"><AppIcon name="user" /></span><h2>Tu actividad, en un solo lugar</h2><p>Completa tu perfil para consultar tus compras, pujas y guardados.</p><button class="neu-button primary-button" @click="profileOpen = true"><AppIcon name="user" />Crear mi perfil</button></section>
    <div v-else-if="error" class="load-error neu-surface" role="alert"><p>No se pudo cargar tu actividad.</p><button class="neu-button" @click="refresh()">Reintentar</button></div>
    <template v-else-if="data">
      <div class="activity-metrics"><button class="activity-metric neu-surface" @click="changeTab('bids')"><span>Pujas en curso<AppIcon name="gavel" /></span><strong>{{ activeCount }}</strong></button><button class="activity-metric neu-surface" @click="changeTab('saved')"><span>Artículos guardados<AppIcon name="heart" /></span><strong>{{ data.counts.saved }}</strong></button><button class="activity-metric neu-surface" @click="changeTab('opportunities')"><span>Segundas oportunidades<AppIcon name="refresh" /></span><strong>{{ data.counts.opportunities }}</strong></button></div>
      <nav class="activity-tabs" aria-label="Secciones de mi actividad"><button v-for="item in tabs" :key="item.key" class="neu-button" :class="{ selected: tab === item.key }" :aria-pressed="tab === item.key" @click="changeTab(item.key)">{{ item.label }}</button></nav>
      <PurchaseList v-if="tab === 'purchases'" /><div v-else class="activity-results" :aria-busy="status === 'pending'">
        <p v-if="data.tab !== tab" class="loading-state" role="status">Cargando actividad…</p>
        <article v-for="item in rows" v-else :key="item.id" class="activity-row neu-surface"><div class="activity-photo"><img v-if="item.photoUrl" :src="item.photoUrl" :alt="item.title" loading="lazy" /><AppIcon v-else name="box" /></div><div class="activity-info"><span class="activity-status" :class="itemStatus(item)">{{ statusLabels[itemStatus(item)] }}</span><h2>{{ item.title }}</h2><p class="activity-category">{{ item.category }}{{ item.category ? ' · ' : '' }}{{ item.mode === 'auction' ? 'Subasta' : 'Venta' }}</p><div v-if="item.myBidAmountCents !== null || item.initialPriceCents !== null" class="activity-prices"><span v-if="item.myBidAmountCents !== null">Tu mejor puja <strong>{{ money(item.myBidAmountCents) }}</strong></span><span>{{ item.mode === 'sale' ? 'Precio' : item.highestBidAmountCents !== null ? 'Oferta más alta' : 'Precio inicial' }} <strong>{{ money(item.highestBidAmountCents ?? item.initialPriceCents) }}</strong></span></div><ArticleCountdown v-if="item.mode === 'auction' && item.closesAt && item.status !== 'sold'" :closes-at="item.closesAt" show-date /><p v-if="itemStatus(item) === 'highest'" class="activity-notice">Cleo se pondrá en contacto contigo para acordar la entrega.</p><p v-if="itemStatus(item) === 'opportunity'" class="activity-notice">El postor anterior no concretó. Ahora Cleo puede contactarte.</p></div><div class="activity-actions"><FavoriteButton :id="item.id" /><NuxtLink v-if="item.viewable" class="neu-button primary-button" :to="`/articulos/${item.id}`">{{ item.mode === 'auction' ? 'Ver subasta' : 'Ver artículo' }}<AppIcon name="chevron-right" /></NuxtLink></div></article>
        <div v-if="!rows.length && data.tab === tab" class="activity-empty neu-surface"><span class="empty-icon"><AppIcon :name="tab === 'saved' ? 'heart' : tab === 'opportunities' ? 'refresh' : 'gavel'" /></span><p>{{ empty }}</p><NuxtLink v-if="tab !== 'opportunities'" class="text-link" to="/">Explorar artículos<AppIcon name="chevron-right" /></NuxtLink></div>
      </div>
      <nav v-if="tab !== 'purchases' && (data.total > data.pageSize || page > 1)" class="activity-pagination pagination" aria-label="Páginas de actividad"><button class="neu-button" :disabled="page === 1 || status === 'pending'" @click="changePage(page - 1)">Anterior</button><span>{{ page }}</span><button class="neu-button" :disabled="page * data.pageSize >= data.total || status === 'pending'" @click="changePage(page + 1)">Siguiente</button></nav>
    </template>
  </div>
</template>
