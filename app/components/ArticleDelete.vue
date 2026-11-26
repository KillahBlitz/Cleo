<script setup lang="ts">
const props = defineProps<{ id: string; title: string }>()
const dialog = ref<HTMLDialogElement>(), pending = ref(false), error = ref('')
async function remove() {
  if (pending.value) return
  pending.value = true; error.value = ''
  try { await $fetch(`/api/admin/articles/${props.id}`, { method: 'DELETE' }); dialog.value?.close(); await navigateTo('/panel/articulos') }
  catch { error.value = 'No se pudo eliminar el artículo.' }
  finally { pending.value = false }
}
</script>
<template><button class="neu-button danger-button" @click="dialog?.showModal()"><AppIcon name="trash" />Eliminar</button><dialog ref="dialog" class="form-dialog" aria-labelledby="delete-title" @cancel="pending && $event.preventDefault()"><h2 id="delete-title">¿Eliminar definitivamente?</h2><p class="delete-name">{{ title }}</p><p class="field-hint">Se borrarán el artículo, sus fotos, pujas, compras y guardados. No se puede deshacer.</p><p v-if="error" class="error" role="alert">{{ error }}</p><div class="form-actions"><button class="neu-button" :disabled="pending" @click="dialog?.close()">Cancelar</button><button class="neu-button danger-button" :disabled="pending" @click="remove">{{ pending ? 'Eliminando…' : 'Eliminar artículo' }}</button></div></dialog></template>
