<script setup lang="ts">
import type { IconName } from '~/components/AppIcon.vue'
const route = useRoute()
const items: { to: string; label: string; icon: IconName }[] = [
  { to: '/panel', label: 'Resumen', icon: 'grid' },
  { to: '/panel/articulos', label: 'Artículos', icon: 'box' },
  { to: '/panel/subastas', label: 'Subastas', icon: 'gavel' },
  { to: '/panel/ventas', label: 'Ventas', icon: 'bag' },
  { to: '/panel/entregas', label: 'Entregas', icon: 'calendar' },
  { to: '/panel/usuarios', label: 'Postores', icon: 'user' },
]
const { data: session } = await useFetch('/api/auth/session', { key: 'admin-session' })
const pending = ref(false), error = ref('')
async function logout() {
  pending.value = true; error.value = ''
  try {
    await $fetch('/api/auth/logout', { method: 'POST' })
    clearNuxtData()
    await navigateTo('/login', { replace: true })
  } catch { error.value = 'No se pudo cerrar la sesión.' }
  finally { pending.value = false }
}
</script>
<template>
  <div class="admin-shell">
    <aside class="admin-sidebar">
      <NuxtLink class="wordmark" to="/panel" aria-label="Cleo, panel">cleo<span>®</span></NuxtLink>
      <span class="sidebar-caption">ADMINISTRACIÓN</span>
      <nav class="admin-nav" aria-label="Administración">
        <NuxtLink v-for="item in items" :key="item.to" :to="item.to" class="nav-item" :class="{ selected: (item.to === '/panel' ? route.path === item.to : route.path.startsWith(item.to)) }" :aria-current="(item.to === '/panel' ? route.path === item.to : route.path.startsWith(item.to)) ? 'page' : undefined"><AppIcon :name="item.icon" /><span>{{ item.label }}</span></NuxtLink>
      </nav>
      <div class="sidebar-bottom">
        <NuxtLink class="nav-item" to="/"><AppIcon name="external" /><span>Ver sitio</span></NuxtLink>
        <button class="nav-item" type="button" :disabled="pending" @click="logout"><AppIcon :name="pending ? 'spinner' : 'logout'" :class="{ spinning: pending }" /><span>Cerrar sesión</span></button>
        <p v-if="error" role="alert" class="error">{{ error }}</p>
      </div>
    </aside>
    <div class="admin-body">
      <header class="admin-header"><span class="admin-breadcrumb">Panel de control</span><div class="admin-account"><ThemeToggle /><div class="account-name"><span class="account-avatar"><AppIcon name="user" /></span><span>{{ session?.user }}</span></div></div></header>
      <main id="admin-content" class="admin-main"><slot /></main>
      <footer class="admin-footer">© {{ new Date().getFullYear() }} Cleo</footer>
    </div>
  </div>
</template>
