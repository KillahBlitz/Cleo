<script setup lang="ts">
interface AdminBid { id: string; amountCents: number; bidder: { name: string }; createdAt: string }
interface RankedBidder { bidId: string; userId: string; name: string; facebookUrl: string; amountCents: number; declined: boolean }
const props = defineProps<{ id: string; sold?: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const { data, refresh, error: loadError, status } = await useFetch<{ ranking: RankedBidder[]; closed: boolean; bids: AdminBid[] }>(`/api/admin/articles/${props.id}/bids`)
const pending = ref(false), error = ref(''), deleteError = ref(''), dialog = ref<HTMLDialogElement>()
const selection = ref<{ id: string; name: string; amountCents: number } | null>(null)
const current = computed(() => data.value?.ranking.find(bidder => !bidder.declined))
const money = useMoney()
async function reload() { await refresh(); emit('changed') }
async function next() {
  if (!current.value || pending.value) return
  pending.value = true; error.value = ''
  try { await $fetch(`/api/admin/articles/${props.id}/next-bidder`, { method: 'POST', body: { userId: current.value.userId } }); await reload() }
  catch { error.value = 'No se pudo avanzar. Actualiza los postores.' }
  finally { pending.value = false }
}
function confirmDelete(id: string, name: string, amountCents: number) {
  if (pending.value) return
  selection.value = { id, name, amountCents }; deleteError.value = ''
  dialog.value?.showModal()
}
async function remove() {
  if (!selection.value || pending.value) return
  pending.value = true; deleteError.value = ''
  try {
    await $fetch(`/api/admin/articles/${props.id}/bids/${selection.value.id}`, { method: 'DELETE' })
    dialog.value?.close(); selection.value = null
    await reload()
  } catch (e: any) { deleteError.value = [400, 404].includes(e.statusCode) ? e.data?.statusMessage : 'No se pudo confirmar la eliminación. Puedes reintentar.' }
  finally { pending.value = false }
}
</script>
<template>
  <section class="bid-admin">
    <div class="card-heading"><h3>Postores · mayor a menor</h3><button class="neu-button" :disabled="pending || status === 'pending'" @click="reload()">Actualizar</button></div>
    <p v-if="loadError" class="error" role="alert">No se pudieron cargar las pujas. Pulsa Actualizar para reintentar.</p>
    <p v-else-if="!data?.ranking.length" class="field-hint">Sin pujas.</p>
    <template v-else>
      <div class="table-scroll"><table class="records-table"><thead><tr><th>Orden</th><th>Postor</th><th>Oferta</th><th>Contacto</th><th>Estado</th><th>Acciones</th></tr></thead><tbody><tr v-for="(bidder, i) in data.ranking" :key="bidder.userId"><td>{{ i + 1 }}</td><td>{{ bidder.name }}</td><td>{{ money(bidder.amountCents) }}</td><td><a :href="bidder.facebookUrl" target="_blank" rel="noopener noreferrer" class="text-link">Facebook<AppIcon name="external" /></a></td><td>{{ bidder.declined ? 'Sin acuerdo' : sold ? 'Registrada' : current?.userId === bidder.userId ? 'Primera opción' : 'En espera' }}</td><td><button class="neu-button danger-button bid-delete-button" :disabled="pending" :aria-label="`Eliminar puja de ${bidder.name} por ${money(bidder.amountCents)}`" @click="confirmDelete(bidder.bidId, bidder.name, bidder.amountCents)"><AppIcon name="trash" />Eliminar puja</button></td></tr></tbody></table></div>
      <NuxtLink v-if="data.closed && current" class="neu-button primary-button" :to="{ path: '/panel/entregas', query: { articulo: id } }"><AppIcon name="calendar" />Agendar entrega</NuxtLink>
      <button v-if="data.closed && current && !sold" class="neu-button" :disabled="pending" @click="next">Sin acuerdo con {{ current.name }} · pasar al siguiente</button>
      <details v-if="data.bids.length"><summary>Historial completo · menor a mayor</summary><ol class="bid-history admin-bid-history"><li v-for="bid in data.bids" :key="bid.id"><span>{{ bid.bidder.name }}</span><strong>{{ money(bid.amountCents) }}</strong><button class="neu-button danger-button bid-delete-button" :disabled="pending" :aria-label="`Eliminar puja de ${bid.bidder.name} por ${money(bid.amountCents)}`" @click="confirmDelete(bid.id, bid.bidder.name, bid.amountCents)"><AppIcon name="trash" />Eliminar</button></li></ol></details>
    </template>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <dialog ref="dialog" class="form-dialog" aria-labelledby="delete-bid-title" aria-describedby="delete-bid-description" @cancel="pending && $event.preventDefault()">
      <h2 id="delete-bid-title">¿Eliminar esta puja?</h2>
      <p v-if="selection" class="delete-name">{{ selection.name }} · {{ money(selection.amountCents) }}</p>
      <p id="delete-bid-description" class="field-hint">Se borrará definitivamente y se recalculará la mejor oferta. No se puede deshacer.</p>
      <p v-if="deleteError" class="error" role="alert">{{ deleteError }}</p>
      <div class="form-actions"><button class="neu-button" :disabled="pending" autofocus @click="dialog?.close()">Cancelar</button><button class="neu-button danger-button" :disabled="pending" @click="remove"><AppIcon :name="pending ? 'spinner' : 'trash'" :class="{ spinning: pending }" />{{ pending ? 'Eliminando…' : 'Eliminar puja' }}</button></div>
    </dialog>
  </section>
</template>
