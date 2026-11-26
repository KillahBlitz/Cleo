<script setup lang="ts">
useHead({ title: 'Calendario de entregas · Cleo' })
</script>
<template><div class="store-container"><NuxtLink class="text-link delivery-back" to="/"><AppIcon name="chevron-left" />Volver a los artículos</NuxtLink><DeliveryCalendar /></div></template>
