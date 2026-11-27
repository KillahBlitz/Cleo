<script setup lang="ts">
import type { ArticleDetail } from '~~/shared/types/admin'
const route = useRoute()
const { data, error, refresh } = await useFetch<ArticleDetail>(`/api/admin/articles/${route.params.id}`)
useHead(() => ({ title: `${data.value?.title || 'Artículo'} · Cleo` }))
const money = useMoney()
const currency = (cents: number | null) => cents === null ? 'Sin pujas' : money(cents)
</script>
<template>
  <div class="admin-page">
  <div class="page-heading"><h1>Artículo</h1><div class="heading-actions"><template v-if="data"><ArticleSoldButton :id="data.id" :sold="data.status === 'sold'" @changed="refresh()" /><NuxtLink v-if="data.mode === 'sale'" class="neu-button" :to="{ path: '/panel/ventas', query: { articulo: data.id } }"><AppIcon name="bag" />Compras</NuxtLink><NuxtLink class="neu-button primary-button" :to="`/panel/articulos/${data.id}/editar`"><AppIcon name="edit" />Editar</NuxtLink><ArticleDelete :id="data.id" :title="data.title" /></template><NuxtLink class="neu-button" to="/panel/articulos">Volver</NuxtLink></div></div>
  <div v-if="error" class="load-error neu-surface" role="alert"><p>{{ error.statusCode === 404 ? 'Artículo no encontrado.' : 'No se pudo cargar el artículo.' }}</p><button class="neu-button" @click="refresh()">Reintentar</button></div>
  <article v-else-if="data" class="article-detail neu-surface">
    <FeaturedToggle v-if="data.status !== 'sold'" :id="data.id" :star="data.star" @changed="refresh()" /><div class="detail-heading"><h2>{{ data.title }}</h2><span class="status-badge" :class="{ 'is-active': data.active && data.status !== 'sold', 'is-sold': data.status === 'sold' }">{{ data.status === 'sold' ? 'Vendido' : data.active ? 'Activo' : 'Inactivo' }}</span></div>
    <div class="detail-photos"><img v-for="(photo, index) in data.photos" :key="photo.id" :src="photo.url" :alt="`${data.title}, foto ${index + 1}`" /></div>
    <dl class="detail-grid"><div><dt>Categoría</dt><dd>{{ data.category }}</dd></div><div><dt>Modalidad</dt><dd>{{ data.mode === 'auction' ? 'Subasta' : 'Venta' }}</dd></div><div><dt>{{ data.mode === 'sale' ? 'Precio fijo' : 'Precio inicial' }}</dt><dd>{{ currency(data.initialPriceCents) }}</dd></div><div v-if="data.mode === 'auction'"><dt>Tiempo restante</dt><dd><span v-if="data.status === 'sold'">Venta finalizada</span><ArticleCountdown v-else :closes-at="data.closesAt" show-date /></dd></div><div v-if="data.mode === 'auction'"><dt>Mejor oferta</dt><dd>{{ currency(data.highestBidAmountCents) }}</dd></div><div v-if="data.mode === 'auction'"><dt>Mejor postor</dt><dd>{{ data.highestBidder?.name || 'Sin postor' }}</dd></div><template v-if="data.mode === 'sale'"><div><dt>Tipo</dt><dd>{{ data.saleType === 'package' ? 'Paquete' : 'Artículo' }}</dd></div><div v-if="data.discountPriceCents !== null"><dt>Precio con descuento</dt><dd>{{ money(data.discountPriceCents) }}</dd></div><div><dt>Unidades disponibles</dt><dd>{{ data.units ?? 0 }}</dd></div><div><dt>Unidades reservadas</dt><dd>{{ data.reservedUnits }}</dd></div></template></dl>
    <h3>Descripción</h3><p class="article-description">{{ data.description }}</p>
    <AdminBidRanking v-if="data.mode === 'auction'" :id="data.id" :sold="data.status === 'sold'" @changed="refresh()" />
  </article>
  </div>
</template>
