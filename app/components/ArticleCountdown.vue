<script setup lang="ts">
const props = defineProps<{ closesAt: string | null; showDate?: boolean }>()
const now = ref<number | null>(null)
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { now.value = Date.now(); timer = setInterval(() => { now.value = Date.now() }, 1000) })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
const formatted = computed(() => props.closesAt ? now.value === null ? new Date(props.closesAt).toISOString() : new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(props.closesAt)) : '—')
const remaining = computed(() => {
  if (!props.closesAt || now.value === null) return null
  return Math.max(0, Math.ceil((new Date(props.closesAt).getTime() - now.value) / 1000))
})
const label = computed(() => {
  const seconds = remaining.value
  if (seconds === null) return '—'
  if (seconds === 0) return 'Finalizada'
  const d = Math.floor(seconds / 86400), h = Math.floor(seconds / 3600) % 24, m = Math.floor(seconds / 60) % 60, s = seconds % 60
  return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`
})
</script>
<template><span class="countdown" :class="{ expired: remaining === 0 }" :title="formatted"><AppIcon name="clock" /><time v-if="closesAt" :datetime="closesAt" :aria-label="`Cierre: ${formatted}. ${label}`">{{ label }}</time><span v-else>—</span><small v-if="showDate && closesAt">{{ formatted }}</small></span></template>
