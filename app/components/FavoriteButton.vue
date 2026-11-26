<script setup lang="ts">
const props = defineProps<{ id: string; label?: boolean }>()
const { isSaved, pending, errors, setSaved } = useFavorites()
const saved = computed(() => isSaved(props.id))
</script>
<template><div class="favorite-control"><button type="button" class="neu-button favorite-button" :class="{ 'icon-button': !label, 'is-saved': saved }" :aria-label="saved ? 'Quitar de guardados' : 'Guardar artículo'" :aria-pressed="saved" :disabled="pending[id]" :title="saved ? 'Quitar de guardados' : 'Guardar artículo'" @click="setSaved(id, !saved)"><AppIcon :name="pending[id] ? 'spinner' : 'heart'" :class="{ spinning: pending[id] }" /><span v-if="label">{{ saved ? 'Guardado' : 'Guardar' }}</span></button><p v-if="errors[id]" class="favorite-error" role="alert">{{ errors[id] }}</p></div></template>
