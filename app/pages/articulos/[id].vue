<script setup lang="ts">
import type { BidderProfile, StoreArticle, PublicBid } from '~~/shared/types/store'
const route = useRoute(), money = useMoney()
const id = String(route.params.id)
const { data, error, refresh } = await useFetch<{ article: StoreArticle }>(`/api/public/articles/${id}`)
const { data: history, refresh: refreshHistory } = await useFetch<{ bids: PublicBid[] }>(`/api/public/articles/${id}/bids`)
const { data: profile, refresh: refreshProfile } = await useFetch<{ profile: BidderProfile | null }>('/api/public/profile', { key: 'bidder-profile' })
const article = computed(() => data.value?.article)
const displayedPrice = computed(() => article.value ? article.value.mode === 'sale' ? article.value.discountPriceCents ?? article.value.initialPriceCents : article.value.highestBidAmountCents ?? article.value.initialPriceCents : null)
const reducedPrice = computed(() => article.value?.mode === 'sale' ? article.value.discountPriceCents !== null : article.value?.highestBidAmountCents !== null)
useHead(() => ({ title: `${article.value?.title || 'Artículo'} · Cleo` }))
const selected = ref(0), amount = ref(''), pending = ref(false), message = ref(''), bidError = ref(''), now = ref<number | null>(null)
const request = ref<{ id: string; amount: number } | null>(null)
const open = computed(() => !!article.value?.canBid && (now.value === null || new Date(article.value.closesAt || 0).getTime() > now.value))
const minimum = computed(() => article.value?.highestBidAmountCents == null ? 100 : (Math.floor(article.value.highestBidAmountCents / 100) + 1) * 100)
const suggestedAmount = computed(() => article.value?.highestBidAmountCents == null ? Math.ceil((article.value?.initialPriceCents ?? 100) / 100) : minimum.value / 100)
const profileOpen = useState<boolean>('profile-dialog-open', () => false)
let poll: ReturnType<typeof setInterval> | undefined, clock: ReturnType<typeof setInterval> | undefined
onMounted(() => { now.value = Date.now(); clock = setInterval(() => { now.value = Date.now() }, 1000); poll = setInterval(() => { if (document.visibilityState === 'visible' && !pending.value) { refresh(); refreshHistory(); refreshProfile() } }, 5000) })
onBeforeUnmount(() => { if (poll) clearInterval(poll); if (clock) clearInterval(clock) })
async function bid() {
  if (!article.value || pending.value || !open.value) return
  message.value = ''; bidError.value = ''
  const value = String(amount.value)
  if (!/^\d{1,9}$/.test(value)) { bidError.value = 'Escribe una cantidad en pesos enteros, sin centavos.'; return }
  const cents = Number(value) * 100
  if (cents < minimum.value) { bidError.value = `La oferta mínima es ${money(minimum.value)}.`; return }
  if (!request.value || request.value.amount !== cents) request.value = { id: crypto.randomUUID(), amount: cents }
  pending.value = true
  try {
    await $fetch(`/api/public/articles/${id}/bids`, { method: 'POST', body: { amountCents: cents, requestId: request.value.id } })
    request.value = null; amount.value = ''; message.value = 'Tu puja quedó registrada.'
    await Promise.all([refresh(), refreshHistory()])
  } catch (e: any) {
    bidError.value = [400, 401, 403, 409, 429].includes(e.statusCode) ? e.data?.statusMessage : 'No se pudo confirmar la puja. Puedes reintentar.'
    if (e.statusCode === 409) { request.value = null; await refresh() }
  } finally { pending.value = false }
}
</script>
<template><div class="store-container"><NuxtLink class="text-link" :to="{ path: '/', query: { modalidad: article?.mode } }"><AppIcon name="chevron-left" />Volver a los artículos</NuxtLink><div v-if="error" class="load-error neu-surface"><p>Este artículo no está disponible.</p><button class="neu-button" @click="refresh()">Reintentar</button></div><template v-else-if="article"><div class="product-layout"><section class="product-gallery"><div class="product-main-photo neu-surface"><img v-if="article.photos[selected]" :src="article.photos[selected]!.url" :alt="article.title" /><AppIcon v-else name="box" /><span v-if="article.star" class="featured-tag"><AppIcon name="star" />Selección Cleo</span></div><div class="product-thumbnails"><button v-for="(photo, i) in article.photos" :key="photo.id" :class="{ selected: selected === i }" :aria-label="`Ver foto ${i + 1}`" :aria-pressed="selected === i" @click="selected = i"><img :src="photo.url" alt="" /></button></div></section><section class="product-information"><div class="product-category-heading"><span class="category-label">{{ article.category }} · {{ article.mode === 'auction' ? 'Subasta' : 'Venta directa' }}</span><FavoriteButton :id="article.id" label /></div><h1>{{ article.title }}</h1><p v-if="article.status === 'sold'" class="status-badge is-sold product-sold"><AppIcon name="check" />Vendido</p><div class="product-price"><s v-if="reducedPrice">{{ money(article.initialPriceCents) }}</s><strong>{{ money(displayedPrice) }}</strong><span>{{ article.mode === 'sale' ? article.saleType === 'package' ? 'Precio por paquete' : 'Precio por artículo' : article.highestBidAmountCents !== null ? 'Oferta más alta' : 'Precio inicial' }}</span></div><div v-if="article.mode === 'auction'" class="product-countdown neu-surface"><span v-if="article.status === 'sold'">Venta finalizada</span><template v-else><span>{{ article.mode === 'auction' ? 'La subasta termina en' : 'Disponible hasta' }}</span><ArticleCountdown :closes-at="article.closesAt" show-date /></template></div><template v-if="article.mode === 'auction'"><p v-if="!open" class="profile-status">{{ article.status === 'sold' ? 'Este artículo ya fue vendido.' : 'Subasta finalizada.' }}</p><template v-else-if="!profile?.profile"><button class="submit" type="button" @click="profileOpen = true"><AppIcon name="user" />Completar perfil para pujar</button></template><form v-else class="bid-form" @submit.prevent="bid">
  <label for="bid-amount">Tu oferta (MXN, sin centavos)</label>
  <input id="bid-amount" v-model="amount" type="number" :min="minimum / 100" max="999999999" step="1" inputmode="numeric" required :disabled="pending" :placeholder="String(suggestedAmount)" aria-describedby="bid-minimum" />
  <p id="bid-minimum" class="field-hint">Mínimo {{ money(minimum) }}.</p>
  <button class="submit" :disabled="pending || !open" type="submit"><AppIcon :name="pending ? 'spinner' : 'gavel'" :class="{ spinning: pending }" />{{ pending ? 'Registrando…' : article.highestBidAmountCents === null ? 'Iniciar puja' : 'Pujar' }}</button>
</form><p v-if="message" class="success-message" role="status">{{ message }}</p><p v-if="bidError" class="error" role="alert">{{ bidError }}</p></template><template v-if="article.mode === 'sale'"><p class="stock-label">{{ article.units }} {{ article.saleType === 'package' ? 'paquetes disponibles' : 'unidades disponibles' }}</p><PurchaseForm :article="article" @purchased="refresh()" /></template><div class="product-description"><h2>Sobre este artículo</h2><p>{{ article.description }}</p></div></section></div><section v-if="article.mode === 'auction'" class="public-bids neu-surface"><div class="card-heading"><h2>{{ article.bidCount > 100 ? 'Últimas 100 pujas' : 'Historial de pujas' }}</h2><span>{{ article.bidCount }} pujas · menor a mayor</span></div><ol v-if="history?.bids.length" class="bid-history"><li v-for="(entry, i) in history.bids" :key="`${entry.createdAt}-${i}`"><span>{{ entry.name }}</span><strong>{{ money(entry.amountCents) }}</strong></li></ol><p v-else class="field-hint">Sé la primera persona en pujar.</p></section></template></div></template>
