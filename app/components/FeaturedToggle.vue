<script setup lang="ts">
const props = defineProps<{ id: string; star: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const pending = ref(false), error = ref('')
async function toggle() {
  pending.value = true; error.value = ''
  try { await $fetch(`/api/admin/articles/${props.id}/star`, { method: 'PATCH', body: { star: !props.star } }); emit('changed') }
  catch (e: any) { error.value = e.statusCode === 409 ? e.data?.statusMessage || 'No se pudo actualizar el destacado.' : 'No se pudo actualizar.' }
  finally { pending.value = false }
}
</script>
<template><div><button class="neu-button" :class="{ 'star-selected': star }" :aria-pressed="star" :disabled="pending" @click="toggle"><AppIcon name="star" />{{ star ? 'Quitar destacado' : 'Destacar en portada' }}</button><p v-if="error" class="error" role="alert">{{ error }}</p></div></template>
