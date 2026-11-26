<script setup lang="ts">
const open = useState<boolean>('profile-dialog-open', () => false)
const dialog = ref<HTMLDialogElement>()
const route = useRoute(), router = useRouter()
watch(open, async value => {
  await nextTick()
  if (value && !dialog.value?.open) dialog.value?.showModal()
  else if (!value && dialog.value?.open) dialog.value?.close()
}, { flush: 'post' })
onMounted(() => {
  if (route.query.perfil === '1') { open.value = true; router.replace({ query: { ...route.query, perfil: undefined } }) }
  else if (open.value) dialog.value?.showModal()
})
onBeforeUnmount(() => { open.value = false })
</script>
<template><button type="button" class="neu-button icon-button profile-button" aria-label="Mi perfil para pujar" title="Mi perfil" @click="open = true"><AppIcon name="user" /></button><dialog ref="dialog" class="profile-modal" aria-label="Tu perfil para pujar" @close="open = false"><button class="neu-button icon-button modal-close" aria-label="Cerrar perfil" type="button" @click="open = false"><AppIcon name="close" /></button><ProfileForm v-if="open" /></dialog></template>
<style scoped>
.profile-modal{width:min(500px,calc(100vw - 36px));max-height:calc(100svh - 36px);padding:0;border:1px solid var(--line);border-radius:26px;background:var(--surface);color:var(--text);box-shadow:0 25px 100px #0005;overflow:auto;overscroll-behavior:contain}
.profile-modal::backdrop{background:#0a0b0b99;backdrop-filter:blur(6px)}
.modal-close{position:absolute;right:22px;top:22px;z-index:1}
</style>
