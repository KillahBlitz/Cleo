<script setup lang="ts">
import type { BidderProfile } from '~~/shared/types/store'
const { data, status, refresh } = useFetch<{ profile: BidderProfile | null }>('/api/public/profile', { key: 'bidder-profile' })
const name = ref(''), facebookUrl = ref(''), initialized = ref(false)
watch(data, value => { if (value && !initialized.value) { name.value = value.profile?.name || ''; facebookUrl.value = value.profile?.facebookUrl || ''; initialized.value = true } }, { immediate: true })
const pending = ref(false), error = ref(''), saved = ref(false)
async function save() {
  pending.value = true; error.value = ''; saved.value = false
  try { await $fetch('/api/public/profile', { method: 'PUT', body: { name: name.value, facebookUrl: facebookUrl.value } }); await refresh(); facebookUrl.value = data.value?.profile?.facebookUrl || ''; saved.value = true }
  catch (e: any) { error.value = [400, 409, 429].includes(e.statusCode) ? e.data?.statusMessage : 'No pudimos guardar tu perfil.' }
  finally { pending.value = false }
}
</script>
<template><section class="profile-card"><span class="profile-emblem"><AppIcon name="user" /></span><h2>Tu perfil para pujar</h2><p class="profile-subtitle">Tu nombre en las pujas y dónde contactarte si ganas.</p><form class="admin-form" @submit.prevent="save"><fieldset :disabled="pending || (!initialized && status === 'pending')"><div class="form-field"><label for="bidder-name">Nombre de usuario</label><input id="bidder-name" v-model="name" autocomplete="nickname" required minlength="2" maxlength="60" /></div><div class="form-field"><label for="bidder-facebook">Enlace a tu perfil de Facebook</label><input id="bidder-facebook" v-model="facebookUrl" type="url" inputmode="url" placeholder="https://www.facebook.com/tu.perfil" required maxlength="500" /></div><p v-if="saved" class="success-message" role="status">Perfil guardado.</p><p v-if="error" class="error" role="alert">{{ error }}</p><button class="submit" type="submit"><AppIcon :name="pending ? 'spinner' : 'check'" :class="{ spinning: pending }" />{{ pending ? 'Guardando…' : 'Guardar perfil' }}</button></fieldset></form><p class="field-hint">Tu perfil se conserva en este navegador.</p></section></template>
