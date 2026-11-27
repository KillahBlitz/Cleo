<script setup lang="ts">
import type { BidderProfile } from '~~/shared/types/store'
const { data, status, refresh } = useFetch<{ profile: BidderProfile | null }>('/api/public/profile', { key: 'bidder-profile' })
const name = ref(''), facebookUrl = ref(''), phone = ref(''), initialized = ref(false)
function fill(profile: BidderProfile | null | undefined) {
  name.value = profile?.name || ''; facebookUrl.value = profile?.facebookUrl || ''; phone.value = profile?.phone || ''
}
watch(data, value => { if (value && !initialized.value) { fill(value.profile); initialized.value = true } }, { immediate: true })
const pending = ref(false), error = ref(''), saved = ref(false)
watch([name, facebookUrl, phone], () => { saved.value = false })
async function save() {
  if (pending.value) return
  error.value = ''; saved.value = false
  if (!facebookUrl.value.trim() && !phone.value.trim()) { error.value = 'Agrega tu perfil de Facebook o un número telefónico.'; return }
  pending.value = true
  try {
    const result = await $fetch<{ profile: BidderProfile }>('/api/public/profile', { method: 'PUT', body: { name: name.value, facebookUrl: facebookUrl.value, phone: phone.value } })
    fill(result.profile); await refresh(); saved.value = true
  } catch (e: any) { error.value = [400, 403, 409, 429, 503].includes(e.statusCode) ? e.data?.statusMessage : 'No pudimos guardar tu perfil.' }
  finally { pending.value = false }
}
</script>
<template>
  <section class="profile-card">
    <span class="profile-emblem"><AppIcon name="user" /></span><h2>Tu perfil</h2>
    <p class="profile-subtitle">Tu nombre y un medio de contacto.</p>
    <form class="admin-form" @submit.prevent="save"><fieldset :disabled="pending || (!initialized && status === 'pending')">
      <div class="form-field"><label for="bidder-name">Nombre de usuario</label><input id="bidder-name" v-model="name" autocomplete="nickname" required minlength="2" maxlength="60" /></div>
      <p id="contact-help" class="field-hint">Facebook o teléfono; con uno basta.</p>
      <div class="form-field"><label for="bidder-facebook">Perfil de Facebook</label><input id="bidder-facebook" v-model="facebookUrl" type="url" inputmode="url" placeholder="https://www.facebook.com/tu.perfil" :required="!phone.trim()" maxlength="500" aria-describedby="contact-help" /></div>
      <div class="form-field"><label for="bidder-phone">Número telefónico</label><input id="bidder-phone" v-model="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="55 1234 5678" :required="!facebookUrl.trim()" maxlength="40" aria-describedby="contact-help phone-help" /><p id="phone-help" class="field-hint">10 dígitos en México; para otro país, incluye + y su código.</p></div>
      <p v-if="saved" class="success-message" role="status">Perfil guardado.</p><p v-if="error" class="error" role="alert">{{ error }}</p>
      <button class="submit" type="submit"><AppIcon :name="pending ? 'spinner' : 'check'" :class="{ spinning: pending }" />{{ pending ? 'Guardando…' : 'Guardar perfil' }}</button>
    </fieldset></form><p class="field-hint">Tu perfil se conserva en este navegador.</p>
  </section>
</template>
