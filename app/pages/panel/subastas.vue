<script setup lang="ts">
useHead({ title: 'Subastas · Cleo' })
const route = useRoute()
const eligible = computed(() => route.query.vista === 'articulos')
</script>
<template><AdminListing :key="eligible ? 'eligible' : 'auctions'" :kind="eligible ? 'articles' : 'auctions'" :eligible="eligible" /></template>
