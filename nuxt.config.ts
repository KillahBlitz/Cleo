export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  runtimeConfig: { sessionPassword: '', mongodbUri: '', mongodbDatabase: 'cleo_db', appOrigin: '', trustCloudflare: false },
  app: { head: {
    htmlAttrs: { lang: 'es' }, title: 'Cleo · Subastas',
    meta: [{ name: 'description', content: 'Cleo. Una nueva historia para cada pieza.' }],
    link: [
      { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico?v=cleo-gold-c' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png?v=cleo-gold-c' },
      { rel: 'icon', type: 'image/svg+xml', sizes: 'any', href: '/favicon.svg?v=cleo-gold-c' },
      { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png?v=cleo-gold-c' },
    ],
  } },
})
