export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  runtimeConfig: { sessionPassword: '', mongodbUri: '', mongodbDatabase: 'cleo_db' },
  app: { head: { htmlAttrs: { lang: 'es' }, title: 'Cleo · Subastas', meta: [{ name: 'description', content: 'Cleo. Una nueva historia para cada pieza.' }] } },
})
