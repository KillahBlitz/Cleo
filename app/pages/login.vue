<script setup lang="ts">
const loginDialog = ref<HTMLDialogElement>()
onMounted(() => loginDialog.value?.showModal())
useHead({ title: 'Iniciar sesión · Cleo', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })
const { user } = await useRequestFetch()<{ user: string | null }>('/api/auth/session')
if (user) await navigateTo('/panel', { replace: true })
const username = ref(''), password = ref(''), visible = ref(false), pending = ref(false), error = ref('')
async function login() {
  if (pending.value) return
  pending.value = true; error.value = ''
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { username: username.value, password: password.value } })
    password.value = ''; await navigateTo('/panel')
  } catch (e: any) {
    error.value = e.statusCode === 401 ? 'El usuario o la contraseña no son correctos.' : e.statusCode === 429 ? 'Demasiados intentos. Inténtalo de nuevo en 15 minutos.' : 'No pudimos iniciar sesión. Inténtalo de nuevo.'
  } finally { pending.value = false }
}
</script>
<template>
  <dialog ref="loginDialog" class="login-dialog" aria-label="Iniciar sesión" @cancel="navigateTo('/')">
    <section class="login-card login-form-card" aria-label="Iniciar sesión">
      <form :aria-busy="pending" @submit.prevent="login">
        <label for="username">Usuario</label><input id="username" v-model="username" name="username" autocomplete="username" autocapitalize="none" :spellcheck="false" placeholder="Tu nombre de usuario" required maxlength="100" :disabled="pending" />
        <div class="password-label"><label for="password">Contraseña</label></div>
        <div class="password-wrap"><input id="password" v-model="password" name="password" :type="visible ? 'text' : 'password'" autocomplete="current-password" placeholder="Tu contraseña" required maxlength="256" :disabled="pending" /><button class="reveal" type="button" :aria-label="visible ? 'Ocultar contraseña' : 'Mostrar contraseña'" :aria-pressed="visible" @click="visible = !visible"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path v-if="visible" d="m3 3 18 18"/></svg></button></div>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <button class="submit login-submit" type="submit" :disabled="pending"><AppIcon :name="pending ? 'spinner' : 'lock'" :class="{ spinning: pending }" />{{ pending ? 'Iniciando sesión…' : 'Iniciar sesión' }}</button>
      </form>
    </section>
  </dialog>
</template>
<style scoped>
.login-dialog{width:min(420px,calc(100vw - 40px));max-height:calc(100svh - 40px);padding:0;border:0;border-radius:26px;background:var(--surface);color:var(--text);box-shadow:0 25px 100px #0005;overflow:auto}
.login-dialog::backdrop{background:#0a0b0b80;backdrop-filter:blur(5px)}
</style>
