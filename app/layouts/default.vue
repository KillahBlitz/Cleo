<script setup lang="ts">
import type { BidderProfile } from '~~/shared/types/store'
import type { FavoriteList } from '~~/shared/types/activity'
// The SSR payload contains this browser's private profile and favorites.
if (import.meta.server) useResponseHeader('Cache-Control').value = 'private, no-store'
const route = useRoute()
const store = computed(() => route.path !== '/login')
const [{ data: profile }, { refresh: refreshFavorites }] = await Promise.all([
  useFetch<{ profile: BidderProfile | null }>('/api/public/profile', { key: 'bidder-profile' }),
  useFetch<FavoriteList>('/api/public/favorites', { key: 'bidder-favorites' }),
])
const { intent, setSaved } = useFavorites()
watch(() => profile.value?.profile?.id, async (id, previous) => {
  if (!import.meta.client || id === previous) return
  await refreshFavorites()
  if (id && intent.value) { const articleId = intent.value; intent.value = null; await setSaved(articleId, true) }
})
</script>
<template><div class="shell" :class="{ 'store-shell': store }"><ClientOnly><ParticleBackground /></ClientOnly><header class="site-header"><NuxtLink class="wordmark" to="/" aria-label="Cleo, inicio">cleo<span>®</span></NuxtLink><div class="header-controls"><ProfileDialog v-if="store" /><NuxtLink v-if="store" class="neu-button activity-nav-link" to="/mi-actividad" aria-label="Mi actividad"><AppIcon name="activity" /><span>Mi actividad</span></NuxtLink><NuxtLink v-if="store" class="neu-button delivery-nav-link" to="/entregas" aria-label="Calendario de entregas"><AppIcon name="calendar" /><span>Entregas</span></NuxtLink><NuxtLink v-if="store" class="neu-button map-nav-link" to="/mapa" aria-label="Mapa de entregas"><AppIcon name="map" /><span>Mapa</span></NuxtLink><ThemeToggle /></div></header><main class="public-main"><slot /></main><footer class="site-footer"><span>© {{ new Date().getFullYear() }} Cleo</span><span class="footer-dot">Hecho para encontrar tesoros <AppIcon name="sparkle" /></span></footer></div></template>
