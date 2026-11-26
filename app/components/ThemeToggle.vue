<script setup lang="ts">
const theme = useCookie<'light' | 'dark'>('cleo-theme', { default: () => 'light', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
const dark = computed(() => theme.value === 'dark')
useHead(() => ({ htmlAttrs: { 'data-theme': dark.value ? 'dark' : 'light' } }))
onMounted(() => {
  try {
    const saved = localStorage.getItem('cleo-theme')
    if (saved === 'dark' || saved === 'light') theme.value = saved
  } catch {}
})
function toggle() {
  theme.value = dark.value ? 'light' : 'dark'
  try { localStorage.setItem('cleo-theme', theme.value) } catch {}
}
</script>
<template><button class="theme-button neu-button icon-button" type="button" :aria-label="dark ? 'Activar modo claro' : 'Activar modo oscuro'" :title="dark ? 'Modo claro' : 'Modo oscuro'" @click="toggle"><AppIcon :name="dark ? 'sun' : 'moon'" /></button></template>
