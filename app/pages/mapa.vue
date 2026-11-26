<script setup lang="ts">
import { preferenceStations } from '~/data/preferenceStations'
useHead({ title: 'Mapa de entregas · Cleo', meta: [{ name: 'description', content: `Consulta los puntos de preferencia Cleo: ${preferenceStations.map(station => station.name).join(', ')}.` }] })
</script>
<template>
  <div class="store-container map-page">
    <div class="map-page-heading"><div><span class="category-label">ENTREGAS CLEO</span><h1>Mapa de entregas</h1><p>Elige tu punto y acuerda la entrega con Cleo.</p></div><a class="neu-button" href="/maps.pdf" download="maps.pdf"><AppIcon name="download" />Descargar PDF</a></div>
    <DeliveryMap />
    <p class="map-source">Mapa de referencia de <a href="https://metro.cdmx.gob.mx/storage/app/media/red/mapa_transporte_cdxm_150419.pdf" target="_blank" rel="noopener noreferrer">Movilidad Integrada CDMX<AppIcon name="external" /></a>. Las marcas doradas señalan los puntos de preferencia de Cleo.</p>
  </div>
</template>
