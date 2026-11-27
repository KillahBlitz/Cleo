<script setup lang="ts">
defineProps<{ facebookUrl?: string; phone?: string }>()
</script>
<template>
  <span class="contact-links">
    <a v-if="facebookUrl" :href="facebookUrl" target="_blank" rel="noopener noreferrer" class="text-link">Facebook<AppIcon name="external" /></a>
    <a v-if="phone" :href="`tel:${phone}`" class="text-link" :aria-label="`Llamar al ${phone}`"><AppIcon name="phone" />{{ phone }}</a>
    <span v-if="!facebookUrl && !phone">—</span>
  </span>
</template>
<style scoped>
.contact-links { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
.contact-links a { min-height: 44px; overflow-wrap: anywhere; }
</style>
