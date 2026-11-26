<script setup lang="ts">
import type { CategoryType, CommerceMode } from '~~/shared/types/admin'
const props = defineProps<{ mode?: CommerceMode }>()
const selected = defineModel<string>({ required: true })
const id = useId()
const query = computed(() => ({ mode: props.mode }))
const { data, status, error, refresh } = await useFetch<{ types: CategoryType[] }>('/api/admin/types', { query })
</script>
<template>
  <div class="category-filter">
    <label :for="id" class="sr-only">Categoría</label>
    <select :id="id" v-model="selected" :disabled="status === 'pending' || !!error" aria-label="Categoría">
      <option value="">{{ status === 'pending' ? 'Cargando categorías…' : error ? 'Categorías no disponibles' : 'Todas las categorías' }}</option>
      <option v-for="type in data?.types || []" :key="type.id" :value="type.id">{{ type.name }}</option>
    </select>
    <button v-if="error" class="text-link retry-link" type="button" @click="refresh()">Reintentar categorías</button>
  </div>
</template>
