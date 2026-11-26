<script setup lang="ts">
import type { CategoryType, CommerceMode } from '~~/shared/types/admin'
const props = defineProps<{ mode: CommerceMode }>()
const emit = defineEmits<{ created: [type: CategoryType] }>()
const dialog = ref<HTMLDialogElement>(), nameInput = ref<HTMLInputElement>()
const name = ref(''), mode = ref<CommerceMode>('auction'), pending = ref(false), error = ref('')
function open() { name.value = ''; mode.value = props.mode; error.value = ''; dialog.value?.showModal(); nextTick(() => nameInput.value?.focus()) }
async function save() {
  if (pending.value) return
  pending.value = true; error.value = ''
  try {
    const type = await $fetch<CategoryType>('/api/admin/types', { method: 'POST', body: { name: name.value.trim(), mode: mode.value } })
    dialog.value?.close()
    await refreshNuxtData()
    emit('created', type)
  } catch (e: any) { error.value = e.statusCode === 409 ? 'Esta categoría ya existe.' : e.statusCode === 400 ? 'Revisa el nombre de la categoría.' : 'No se pudo guardar la categoría.' }
  finally { pending.value = false }
}
</script>
<template>
  <button class="neu-button primary-button" type="button" @click="open"><AppIcon name="plus" />Agregar categoría</button>
  <dialog ref="dialog" class="form-dialog" aria-labelledby="category-title" @cancel="pending && $event.preventDefault()">
    <div class="dialog-heading"><h2 id="category-title">Nueva categoría</h2><button class="neu-button icon-button" type="button" :disabled="pending" aria-label="Cerrar" @click="dialog?.close()"><AppIcon name="close" /></button></div>
    <form class="admin-form" :aria-busy="pending" @submit.prevent="save"><fieldset :disabled="pending">
      <div class="form-field"><label for="category-name">Nombre</label><input id="category-name" ref="nameInput" v-model="name" required minlength="2" maxlength="80" autocomplete="off" /></div>
      <div class="form-field"><label for="category-mode">Modalidad</label><select id="category-mode" v-model="mode"><option value="auction">Subastas</option><option value="sale">Ventas</option></select></div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="form-actions"><button class="neu-button" type="button" @click="dialog?.close()">Cancelar</button><button class="neu-button primary-button" type="submit"><AppIcon :name="pending ? 'spinner' : 'check'" :class="{ spinning: pending }" />{{ pending ? 'Guardando…' : 'Guardar' }}</button></div>
    </fieldset></form>
  </dialog>
</template>
