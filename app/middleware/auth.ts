export default defineNuxtRouteMiddleware(async () => {
  const { user } = await useRequestFetch()<{ user: string | null }>('/api/auth/session')
  if (!user) return navigateTo('/')
})