<script setup lang="ts">
const props = defineProps<{ id: string; sold?: boolean }>()
const { data, refresh } = await useFetch<{ ranking: { userId: string; name: string; facebookUrl: string; amountCents: number; declined: boolean }[]; closed: boolean; bids: { amountCents: number; bidder: { name: string }; createdAt: string }[] }>(`/api/admin/articles/${props.id}/bids`)
const pending = ref(false), error = ref('')
const current = computed(() => data.value?.ranking.find(bidder => !bidder.declined))
const money = useMoney()
async function next() {
  if (!current.value) return
  pending.value = true; error.value = ''
  try { await $fetch(`/api/admin/articles/${props.id}/next-bidder`, { method: 'POST', body: { userId: current.value.userId } }); await refresh() }
  catch { error.value = 'No se pudo avanzar. Actualiza los postores.' }
  finally { pending.value = false }
}
</script>
<template><section class="bid-admin"><div class="card-heading"><h3>Postores · mayor a menor</h3><button class="neu-button" @click="refresh()">Actualizar</button></div><p v-if="!data?.ranking.length" class="field-hint">Sin pujas.</p><div v-else class="table-scroll"><table class="records-table"><thead><tr><th>Orden</th><th>Postor</th><th>Oferta</th><th>Contacto</th><th>Estado</th></tr></thead><tbody><tr v-for="(bidder, i) in data.ranking" :key="bidder.userId"><td>{{ i + 1 }}</td><td>{{ bidder.name }}</td><td>{{ money(bidder.amountCents) }}</td><td><a :href="bidder.facebookUrl" target="_blank" rel="noopener noreferrer" class="text-link">Facebook<AppIcon name="external" /></a></td><td>{{ bidder.declined ? 'Sin acuerdo' : sold ? 'Registrada' : current?.userId === bidder.userId ? 'Primera opción' : 'En espera' }}</td></tr></tbody></table></div><NuxtLink v-if="data?.closed && current" class="neu-button primary-button" :to="{ path: '/panel/entregas', query: { articulo: id } }"><AppIcon name="calendar" />Agendar entrega</NuxtLink><button v-if="data?.closed && current && !sold" class="neu-button" :disabled="pending" @click="next">Sin acuerdo con {{ current.name }} · pasar al siguiente</button><p v-if="error" class="error" role="alert">{{ error }}</p><details v-if="data?.bids.length"><summary>Historial completo · menor a mayor</summary><ol class="bid-history"><li v-for="(bid, i) in data.bids" :key="i"><span>{{ bid.bidder.name }}</span><strong>{{ money(bid.amountCents) }}</strong></li></ol></details></section></template>
