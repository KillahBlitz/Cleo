<script setup lang="ts">
type ParticleInstance = { pJS: { fn: { vendors: { destroypJS: () => void } } } }
const particleWindow = () => window as typeof window & { particlesJS?: (id: string, config: unknown) => void; pJSDom?: ParticleInstance[] }
let cleanup: (() => void) | undefined
onMounted(async () => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  if (!particleWindow().particlesJS) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = '/vendor/particles.js'
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Could not load particles'))
      document.head.appendChild(script)
    }).catch(() => {})
  }
  if (!document.getElementById('cleo-particles')) return
  particleWindow().particlesJS?.('cleo-particles', {
    particles: { number: { value: 38, density: { enable: true, value_area: 1000 } }, color: { value: '#b49350' }, shape: { type: 'circle' }, opacity: { value: 0.3, random: true }, size: { value: 2, random: true }, line_linked: { enable: true, distance: 135, color: '#b49350', opacity: 0.11, width: 1 }, move: { enable: true, speed: 0.45, direction: 'none', random: false, straight: false, out_mode: 'out', bounce: false } },
    interactivity: { detect_on: 'canvas', events: { onhover: { enable: false }, onclick: { enable: false }, resize: true } }, retina_detect: true,
  })
  cleanup = () => { particleWindow().pJSDom?.forEach(p => p.pJS.fn.vendors.destroypJS()); particleWindow().pJSDom = [] }
})
onBeforeUnmount(() => cleanup?.())
</script>
<template><div id="cleo-particles" aria-hidden="true" /></template>