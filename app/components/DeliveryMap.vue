<script setup lang="ts">
import { preferenceStations } from '~/data/preferenceStations'
const pageWidth = 2551.179931640625, pageHeight = 3401.570068359375
const stations = preferenceStations
const selected = ref(''), viewport = ref<HTMLDivElement>(), ready = ref(false), failed = ref(false)
const dimensions = ref({ width: 900, height: 540 })
const aspect = computed(() => dimensions.value.width / dimensions.value.height)
const bounds = {
  left: Math.min(...stations.map(station => Math.min(station.x, station.x + station.dx))) - 80,
  right: Math.max(...stations.map(station => Math.max(station.x, station.x + station.dx))) + 80,
  top: Math.min(...stations.map(station => Math.min(station.y, station.y + station.dy))) - 80,
  bottom: Math.max(...stations.map(station => Math.max(station.y, station.y + station.dy))) + 80,
}
function pointsView() { return { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2, width: Math.max(bounds.right - bounds.left, (bounds.bottom - bounds.top) * aspect.value) } }
const view = ref(pointsView()), viewMode = ref<'points' | 'full' | 'custom'>('points')
const fullWidth = computed(() => Math.max(pageWidth, pageHeight * aspect.value))
const viewHeight = computed(() => view.value.width / aspect.value)
const viewBox = computed(() => `${view.value.x - view.value.width / 2} ${view.value.y - viewHeight.value / 2} ${view.value.width} ${viewHeight.value}`)
const activeStation = computed(() => stations.find(station => station.id === selected.value))
const detailed = computed(() => view.value.width < fullWidth.value * .9)
watch(aspect, () => { if (viewMode.value === 'points') showPoints(); else if (viewMode.value === 'full') showFullMap(); else limitView() })
const stationDescription = stations.map((station, index) => `${index + 1} ${station.name}`).join(', ')
const pointers = new Map<number, { x: number; y: number }>()
const dragging = ref(false)
let observer: ResizeObserver | undefined
onMounted(() => {
  if (!viewport.value) return
  observer = new ResizeObserver(([entry]) => {
    if (entry?.contentRect.width && entry.contentRect.height) dimensions.value = { width: entry.contentRect.width, height: entry.contentRect.height }
  })
  observer.observe(viewport.value)
})
onBeforeUnmount(() => observer?.disconnect())
function limitView() {
  view.value.width = Math.min(fullWidth.value, Math.max(260, view.value.width))
  const halfWidth = view.value.width / 2, halfHeight = view.value.width / aspect.value / 2
  view.value.x = halfWidth >= pageWidth / 2 ? pageWidth / 2 : Math.max(halfWidth, Math.min(pageWidth - halfWidth, view.value.x))
  view.value.y = halfHeight >= pageHeight / 2 ? pageHeight / 2 : Math.max(halfHeight, Math.min(pageHeight - halfHeight, view.value.y))
}
function zoom(factor: number, screenX = dimensions.value.width / 2, screenY = dimensions.value.height / 2) {
  viewMode.value = 'custom'
  const oldWidth = view.value.width, newWidth = Math.max(260, Math.min(fullWidth.value, oldWidth * factor))
  view.value.x += (screenX / dimensions.value.width - .5) * (oldWidth - newWidth)
  view.value.y += (screenY / dimensions.value.height - .5) * (oldWidth - newWidth) / aspect.value
  view.value.width = newWidth; limitView()
}
function showPoints() { selected.value = ''; viewMode.value = 'points'; view.value = pointsView(); limitView() }
function showFullMap() { selected.value = ''; viewMode.value = 'full'; view.value = { x: pageWidth / 2, y: pageHeight / 2, width: fullWidth.value } }
function selectStation(id: string) {
  const station = stations.find(item => item.id === id)
  if (!station) return
  selected.value = station.id; viewMode.value = 'custom'
  view.value = { x: station.x + 110, y: station.y - 65, width: 480 }
  limitView()
}
function pointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  viewMode.value = 'custom'
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  dragging.value = true
}
function pointerMove(event: PointerEvent) {
  const previous = pointers.get(event.pointerId)
  if (!previous) return
  const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1]
  if (other) {
    const before = Math.hypot(previous.x - other.x, previous.y - other.y), after = Math.hypot(event.clientX - other.x, event.clientY - other.y)
    const rect = viewport.value!.getBoundingClientRect()
    if (before > 0 && after > 0) zoom(before / after, (previous.x + other.x) / 2 - rect.left, (previous.y + other.y) / 2 - rect.top)
    view.value.x -= (event.clientX - previous.x) / 2 * view.value.width / dimensions.value.width
    view.value.y -= (event.clientY - previous.y) / 2 * viewHeight.value / dimensions.value.height
  } else {
    view.value.x -= (event.clientX - previous.x) * view.value.width / dimensions.value.width
    view.value.y -= (event.clientY - previous.y) * viewHeight.value / dimensions.value.height
  }
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); limitView()
}
function pointerUp(event: PointerEvent) { pointers.delete(event.pointerId); dragging.value = pointers.size > 0 }
function keyboard(event: KeyboardEvent) {
  const step = view.value.width * .12
  if (event.key === 'ArrowLeft') view.value.x -= step
  else if (event.key === 'ArrowRight') view.value.x += step
  else if (event.key === 'ArrowUp') view.value.y -= step
  else if (event.key === 'ArrowDown') view.value.y += step
  else if (event.key === '+' || event.key === '=') zoom(.72)
  else if (event.key === '-') zoom(1.4)
  else if (event.key === 'Home') showPoints()
  else return
  if (event.key !== 'Home') viewMode.value = 'custom'
  event.preventDefault(); limitView()
}
</script>
<template>
  <div class="delivery-map-layout">
    <aside class="map-station-panel neu-surface" aria-labelledby="map-stations-title">
      <div class="map-station-heading"><span class="map-line"><AppIcon name="pin" /></span><h2 id="map-stations-title">Puntos de preferencia</h2></div>
      <div class="map-station-list" role="group" aria-label="Acercar a una estación">
        <button v-for="(station, index) in stations" :key="station.id" class="map-station" :class="{ selected: selected === station.id }" :aria-pressed="selected === station.id" aria-controls="delivery-map-viewport" @click="selectStation(station.id)"><span class="map-station-number">{{ index + 1 }}</span><span>{{ station.name }}</span><AppIcon name="chevron-right" /></button>
      </div>
      <p class="map-station-note">Selecciona una estación para acercar.</p>
      <NuxtLink class="neu-button primary-button" to="/entregas"><AppIcon name="calendar" />Consultar horarios</NuxtLink>
    </aside>
    <section class="map-viewer neu-surface" aria-label="Mapa de puntos de preferencia">
      <div class="map-toolbar"><div class="map-zoom-controls" role="group" aria-label="Zoom del mapa"><button class="neu-button icon-button" aria-label="Alejar mapa" :disabled="view.width >= fullWidth" @click="zoom(1.4)"><AppIcon name="minus" /></button><button class="neu-button icon-button" aria-label="Acercar mapa" :disabled="view.width <= 260" @click="zoom(.72)"><AppIcon name="plus" /></button></div><button class="neu-button" @click="showPoints()"><AppIcon name="pin" />Ver puntos</button><button class="neu-button" @click="showFullMap()"><AppIcon name="map" />Mapa completo</button></div>
      <div id="delivery-map-viewport" ref="viewport" class="map-viewport" :class="{ dragging }" tabindex="0" role="region" aria-label="Mapa desplazable de la Ciudad de México" aria-describedby="map-controls-help" @keydown="keyboard" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="pointerUp" @lostpointercapture="pointerUp">
        <svg :viewBox="viewBox" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="delivery-map-title delivery-map-description">
          <title id="delivery-map-title">Estaciones de preferencia Cleo</title><desc id="delivery-map-description">Mapa de Movilidad Integrada. Puntos de preferencia marcados en dorado: {{ stationDescription }}.</desc>
          <image href="/maps/cdmx.webp" x="0" y="0" :width="pageWidth" :height="pageHeight" @load="ready = true" @error="failed = true" />
          <g v-for="(station, index) in stations" :key="station.id" :transform="`translate(${station.x} ${station.y})`" class="map-marker" :class="{ selected: selected === station.id }">
            <line v-if="detailed" class="map-marker-leader" x1="0" y1="0" :x2="station.dx" :y2="station.dy" />
            <circle class="map-marker-station" r="8" />
            <g v-if="detailed" :transform="`translate(${station.dx} ${station.dy})`"><circle class="map-marker-halo" r="24" /><circle class="map-marker-dot" r="17" /><text text-anchor="middle" dominant-baseline="central" y="1">{{ index + 1 }}</text></g>
          </g>
        </svg>
        <div v-if="!ready || failed" class="map-loading" role="status"><template v-if="failed"><p>No se pudo cargar el mapa.</p><a class="neu-button" href="/maps.pdf" target="_blank" rel="noopener">Abrir PDF<AppIcon name="external" /></a></template><template v-else><AppIcon name="spinner" class="spinning" /><span>Cargando mapa…</span></template></div>
      </div>
      <div class="map-viewer-footer"><p id="map-controls-help">Arrastra para explorar. Usa + / − para acercar.<span class="sr-only"> Con teclado: flechas para desplazar, más y menos para zoom e Inicio para ver todos los puntos.</span></p><span class="map-selected-station" aria-live="polite"><AppIcon name="pin" />{{ activeStation?.name || `${stations.length} puntos de preferencia` }}</span></div>
    </section>
  </div>
</template>
