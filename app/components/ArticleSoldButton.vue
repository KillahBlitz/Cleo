<script setup lang="ts">
const props = defineProps<{ id: string; sold: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const pending = ref(false), error = ref('')
async function markSold() {
  if (pending.value || props.sold) return
  pending.value = true; error.value = ''
  try { await $fetch(`/api/admin/articles/${props.id}/sold`, { method: 'PATCH' }); emit('changed') }
  catch (e: any) { error.value = e.statusCode === 409 ? e.data?.statusMessage : 'No se pudo marcar como vendido. Inténtalo de nuevo.' }
  finally { pending.value = false }
}
</script>
<template><div><button class="neu-button" :class="{ 'primary-button': !sold, 'sold-label': sold }" type="button" :disabled="pending || sold" @click="markSold"><AppIcon :name="pending ? 'spinner' : 'check'" :class="{ spinning: pending }" />{{ pending ? 'Guardando…' : sold ? 'Vendido' : 'Marcar como vendido' }}</button><p v-if="error" class="error" role="alert">{{ error }}</p></div></template>
