<script setup lang="ts">
import type { ArticleDetail } from '~~/shared/types/admin'
useHead({ title: 'Editar artículo · Cleo' })
const route = useRoute()
const { data, error, refresh } = await useFetch<ArticleDetail>(`/api/admin/articles/${route.params.id}`)
</script>
<template><div class="admin-page"><div v-if="error" class="load-error neu-surface"><p>No se pudo cargar el artículo.</p><button class="neu-button" @click="refresh()">Reintentar</button></div><ArticleForm v-else-if="data" :article="data" /></div></template>
