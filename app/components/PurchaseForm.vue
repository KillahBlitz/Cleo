<script setup lang="ts">
import type { StoreArticle, BidderProfile } from '~~/shared/types/store'
const props = defineProps<{ article: StoreArticle }>()
const emit = defineEmits<{ purchased: [] }>()
const money = useMoney(), quantity = ref(1), pending = ref(false), error = ref(''), success = ref(false)
const { data: profile } = useNuxtData<{ profile: BidderProfile | null }>('bidder-profile')
const profileOpen = useState<boolean>('profile-dialog-open', () => false)
const price = computed(() => props.article.discountPriceCents ?? props.article.initialPriceCents)
const request = ref<{ id: string; quantity: number; price: number } | null>(null)
async function purchase() {
  if (pending.value || success.value) return
  error.value = ''
  if (!request.value && (!Number.isInteger(quantity.value) || quantity.value < 1 || quantity.value > props.article.units)) { error.value = 'Selecciona una cantidad disponible.'; return }
  if (!request.value) request.value = { id: crypto.randomUUID(), quantity: quantity.value, price: price.value }
  pending.value = true
  try {
    await $fetch(`/api/public/articles/${props.article.id}/purchases`, { method: 'POST', body: { quantity: request.value.quantity, unitPriceCents: request.value.price, requestId: request.value.id } })
    success.value = true; request.value = null; emit('purchased')
  } catch (e: any) {
    error.value = [400, 401, 404, 409, 429].includes(e.statusCode) ? e.data?.statusMessage : 'No se pudo confirmar la compra. Reintenta para consultar el mismo pedido.'
    if ([400, 401, 404, 409, 429].includes(e.statusCode)) request.value = null
    if (e.statusCode === 409) emit('purchased')
  } finally { pending.value = false }
}
</script>
<template>
  <div class="purchase-form">
    <div v-if="success" class="purchase-confirmation neu-surface" role="status"><AppIcon name="check" /><p>El vendedor se pondrá en contacto contigo para confirmar la compra mediante Facebook.</p><NuxtLink class="text-link" to="/mi-actividad?vista=compras">Ver mis compras<AppIcon name="chevron-right" /></NuxtLink><button v-if="article.canBuy" class="neu-button" @click="success = false">Comprar más</button></div>
    <p v-else-if="!article.canBuy && !request" class="profile-status">Sin unidades disponibles.</p>
    <button v-else-if="!profile?.profile" class="submit" @click="profileOpen = true"><AppIcon name="user" />Completar perfil para comprar</button>
    <form v-else @submit.prevent="purchase">
      <label for="purchase-quantity">{{ article.saleType === 'package' ? 'Paquetes' : 'Unidades' }}</label>
      <div class="quantity-total"><input id="purchase-quantity" v-model.number="quantity" type="number" inputmode="numeric" min="1" :max="request ? request.quantity : article.units" step="1" required :disabled="pending || !!request" /><span>Total <strong>{{ money((request?.price ?? price) * (Number.isInteger(quantity) && quantity > 0 ? quantity : 0)) }}</strong></span></div>
      <button class="submit" type="submit" :disabled="pending"><AppIcon :name="pending ? 'spinner' : 'bag'" :class="{ spinning: pending }" />{{ pending ? 'Registrando…' : 'Comprar' }}</button>
    </form>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </div>
</template>
