<script setup lang="ts">
import type { AdminRecord } from '~~/shared/types/admin'
import type { IconName } from '~/components/AppIcon.vue'
import { NuxtLink } from '#components'
defineProps<{ items: AdminRecord[]; emptyText: string; icon: IconName; articles?: boolean }>()
const labels: Record<string, string> = { draft: 'Borrador', available: 'Disponible', auction: 'En subasta', sold: 'Vendido', scheduled: 'Programada', active: 'Activa', closed: 'Finalizada' }
const price = useMoney()
</script>
<template>
  <div v-if="!items.length" class="empty-state"><span class="empty-icon"><AppIcon :name="icon" /></span><p>{{ emptyText }}</p></div>
  <div v-else class="table-scroll"><table class="records-table"><thead><tr><th scope="col">Nombre</th><th scope="col">Categoría</th><th v-if="articles" scope="col">Precio</th><th scope="col">Estado</th><th v-if="articles" scope="col">Cierre / Unidades</th></tr></thead><tbody>
    <tr v-for="item in items" :key="item.id"><td><component :is="articles ? NuxtLink : 'span'" :to="articles ? `/panel/articulos/${item.id}` : undefined" class="record-name"><img v-if="articles && item.photoUrl" class="record-photo" :src="item.photoUrl" alt="" loading="lazy" /><span v-else class="record-icon"><AppIcon :name="icon" /></span>{{ item.title }}</component></td><td>{{ item.category }}</td><td v-if="articles" class="price-cell">{{ price(item.discountPriceCents ?? item.initialPriceCents) }}</td><td><span class="status-badge" :class="{ 'is-active': item.status !== 'sold' && (articles ? item.active : ['available', 'active'].includes(item.status)), 'is-sold': item.status === 'sold' }">{{ item.status === 'sold' ? 'Vendido' : articles && item.active !== null ? item.active ? 'Activo' : 'Inactivo' : labels[item.status] || item.status }}</span></td><td v-if="articles"><span v-if="item.status === 'sold'">—</span><span v-else-if="item.mode === 'sale'">{{ item.units ?? 0 }} disponibles</span><ArticleCountdown v-else :closes-at="item.closesAt" /></td></tr>
  </tbody></table></div>
</template>
