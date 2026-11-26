<script setup lang="ts">
definePageMeta({ middleware: 'auth', layout: 'admin' })
useHead({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] })
</script>
<template><NuxtPage /></template>
