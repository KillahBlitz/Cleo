<script setup lang="ts">
useHead({ title: 'Ventas · Cleo' })
const route = useRoute()
const articleId = computed(() => typeof route.query.articulo === 'string' ? route.query.articulo : undefined)
</script>
<template><div class="admin-page"><div class="page-heading"><h1>Compras</h1><div class="heading-actions"><NuxtLink v-if="articleId" class="neu-button" to="/panel/ventas">Todas las compras</NuxtLink><NuxtLink class="neu-button" to="/panel/articulos?modalidad=sale"><AppIcon name="box" />Productos</NuxtLink><NuxtLink class="neu-button primary-button" to="/panel/articulos/nuevo?modalidad=sale"><AppIcon name="plus" />Nuevo producto</NuxtLink></div></div><PurchaseList admin :article-id="articleId" /></div></template>
