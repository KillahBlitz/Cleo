<script setup lang="ts">
import type { BidderProfile } from '~~/shared/types/store'
useHead({ title: 'Postores · Cleo' })
const { data, error, refresh } = await useFetch<{ users: BidderProfile[] }>('/api/admin/users')
</script>
<template><div class="admin-page"><div class="page-heading"><h1>Postores</h1><button class="neu-button" @click="refresh()">Actualizar</button></div><section class="data-card neu-surface"><p v-if="error" role="alert">No se pudieron cargar los postores.</p><p v-else-if="!data?.users.length" class="empty-state">Sin perfiles registrados.</p><div v-else class="table-scroll"><table class="records-table"><thead><tr><th>Nombre</th><th>Contacto</th></tr></thead><tbody><tr v-for="user in data.users" :key="user.id"><td>{{ user.name }}</td><td><ContactLinks :facebook-url="user.facebookUrl" :phone="user.phone" /></td></tr></tbody></table></div></section></div></template>
