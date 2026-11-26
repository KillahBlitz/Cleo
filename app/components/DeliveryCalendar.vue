<script setup lang="ts">
import type { DeliveryAppointment, DeliveryCalendarData } from '~~/shared/types/deliveries'
import { DELIVERY_TIMES, deliveryDate, deliveryStart, deliveryEndTime, deliveryDateLabel, deliveryMonthDays } from '~~/shared/utils/deliveries'
const props = defineProps<{ admin?: boolean }>()
const route = useRoute(), router = useRouter()
const initialDate = useState('delivery-initial-date', () => deliveryDate())
const selectedDate = ref(initialDate.value), month = ref(initialDate.value.slice(0, 7))
const { data, error, status, refresh } = await useFetch<DeliveryCalendarData>(props.admin ? '/api/admin/appointments' : '/api/public/deliveries', { query: computed(() => ({ month: month.value })) })
const now = ref(data.value?.now ? Date.parse(data.value.now) : Date.now())
let serverTime = now.value, receivedAt = Date.now()
watch(() => data.value?.now, value => { if (value) { serverTime = Date.parse(value); receivedAt = Date.now(); now.value = serverTime } })
const today = computed(() => deliveryDate(now.value))
const busy = computed(() => new Set(data.value?.month === month.value ? data.value.busy.map(slot => `${slot.date}/${slot.time}`) : []))
const monthLabel = computed(() => deliveryDateLabel(`${month.value}-01`, { month: 'long', year: 'numeric' }))
const cells = computed(() => {
  const start = new Date(`${month.value}-01T12:00:00Z`), offset = (start.getUTCDay() + 6) % 7
  return Array.from({ length: Math.ceil((offset + deliveryMonthDays(month.value)) / 7) * 7 }, (_, i) => {
    const date = new Date(start); date.setUTCDate(1 + i - offset)
    const key = date.toISOString().slice(0, 10)
    return { date: key, day: date.getUTCDate(), current: key.startsWith(month.value), busy: DELIVERY_TIMES.filter(time => busy.value.has(`${key}/${time}`)).length }
  })
})
const daySlots = computed(() => DELIVERY_TIMES.map(time => ({ time, end: deliveryEndTime(time), occupied: busy.value.has(`${selectedDate.value}/${time}`), past: deliveryStart(selectedDate.value, time).getTime() <= now.value, appointment: data.value?.appointments?.find(item => item.date === selectedDate.value && item.time === time) })))
const freeCount = computed(() => daySlots.value.filter(slot => !slot.occupied && !slot.past).length)
const editing = ref<DeliveryAppointment>(), dialogOpen = ref(false), newTime = ref('10:00'), linkedArticle = ref(''), notice = ref('')
const ready = computed(() => !error.value && status.value !== 'pending' && data.value?.month === month.value)
function selectDay(date: string) { selectedDate.value = date; month.value = date.slice(0, 7); notice.value = '' }
function moveMonth(amount: number) { const date = new Date(`${month.value}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + amount); const next = date.toISOString().slice(0, 10); if (next >= '2000-01-01' && next <= '2100-12-31') selectDay(next) }
function openNew(time?: string) { editing.value = undefined; newTime.value = time || daySlots.value.find(slot => !slot.occupied && !slot.past)?.time || '10:00'; dialogOpen.value = true }
function edit(appointment: DeliveryAppointment) { editing.value = appointment; linkedArticle.value = ''; dialogOpen.value = true }
function close() { dialogOpen.value = false; editing.value = undefined; linkedArticle.value = '' }
async function saved(date: string) { selectDay(date); close(); await refresh(); notice.value = 'Calendario actualizado.' }
let timer: ReturnType<typeof setInterval>
onMounted(() => {
  timer = setInterval(() => { now.value = serverTime + Date.now() - receivedAt; if (!document.hidden) refresh() }, 30_000)
  if (props.admin && typeof route.query.articulo === 'string' && /^[a-f\d]{24}$/i.test(route.query.articulo)) { linkedArticle.value = route.query.articulo; openNew(); router.replace({ query: { ...route.query, articulo: undefined } }) }
})
onBeforeUnmount(() => clearInterval(timer))
</script>
<template>
  <div class="delivery-calendar">
    <div class="page-heading delivery-heading"><div><h1>{{ admin ? 'Entregas' : 'Calendario de entregas' }}</h1><p>10:00–18:00 · Turnos de 30 minutos · Hora CDMX</p></div><div class="heading-actions"><button class="neu-button icon-button" type="button" aria-label="Actualizar calendario" :disabled="status === 'pending'" @click="refresh()"><AppIcon name="refresh" /></button><button v-if="admin" class="neu-button primary-button" :disabled="!ready" @click="openNew()"><AppIcon name="plus" />Nueva cita</button></div></div>
    <p v-if="notice" class="success-message" role="status">{{ notice }}</p>
    <div v-if="error" class="load-error neu-surface" role="alert"><p>No se pudo cargar el calendario.</p><button class="neu-button" @click="refresh()">Reintentar</button></div>
    <div v-else class="delivery-layout" :aria-busy="status === 'pending'">
      <section class="delivery-month neu-surface" aria-label="Calendario mensual">
        <div class="delivery-month-heading"><h2 aria-live="polite">{{ monthLabel }}</h2><div class="heading-actions"><button class="neu-button icon-button" aria-label="Mes anterior" @click="moveMonth(-1)"><AppIcon name="chevron-left" /></button><button class="neu-button icon-button" aria-label="Mes siguiente" @click="moveMonth(1)"><AppIcon name="chevron-right" /></button></div></div>
        <div class="delivery-weekdays" aria-hidden="true"><span v-for="day in ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']" :key="day">{{ day }}</span></div>
        <div class="delivery-days"><button v-for="cell in cells" :key="cell.date" class="delivery-day" :class="{ selected: cell.date === selectedDate, outside: !cell.current, today: cell.date === today, past: cell.date < today }" :aria-pressed="cell.date === selectedDate" :aria-current="cell.date === today ? 'date' : undefined" :aria-label="`${deliveryDateLabel(cell.date)}${cell.busy ? `, ${cell.busy} horarios ocupados` : ''}`" @click="selectDay(cell.date)"><span>{{ cell.day }}</span><span v-if="cell.busy" class="delivery-day-count" aria-hidden="true">{{ cell.busy }}<span class="delivery-dot" /></span></button></div>
        <div class="delivery-month-footer"><button class="text-link" @click="selectDay(today)">Ir a hoy</button><span><span class="delivery-dot" />Con citas</span></div>
        <p v-if="!admin" class="delivery-public-note">Elige un horario libre y acuerda tu cita con Cleo.</p>
      </section>
      <section class="delivery-agenda neu-surface" aria-labelledby="delivery-day-title"><div class="delivery-day-heading"><div><h2 id="delivery-day-title">{{ deliveryDateLabel(selectedDate) }}</h2><p>{{ ready ? `${freeCount} horarios disponibles` : 'Actualizando horarios…' }}</p></div><AppIcon name="calendar" /></div>
        <div class="delivery-slots"><div v-for="slot in daySlots" :key="slot.time" class="delivery-slot" :class="{ occupied: slot.occupied, elapsed: slot.past }"><div class="delivery-slot-info"><span class="delivery-time">{{ slot.time }}<span>– {{ slot.end }}</span></span><template v-if="admin && slot.appointment"><strong>{{ slot.appointment.recipientName }}</strong><span v-if="slot.appointment.articleTitle" class="delivery-slot-detail">{{ slot.appointment.articleTitle }}</span><span class="delivery-slot-detail"><AppIcon name="pin" />{{ slot.appointment.location }}</span><span v-if="slot.appointment.notes" class="delivery-slot-detail">{{ slot.appointment.notes }}</span></template><span v-else class="delivery-slot-state">{{ !ready ? 'Actualizando…' : slot.occupied ? 'Ocupado' : slot.past ? 'Horario pasado' : 'Disponible' }}</span></div><button v-if="admin && slot.appointment" class="neu-button icon-button" :disabled="!ready" :aria-label="`Editar cita de ${slot.appointment.recipientName} a las ${slot.time}`" @click="edit(slot.appointment)"><AppIcon name="edit" /></button><button v-else-if="admin && !slot.occupied && !slot.past" class="neu-button icon-button" :disabled="!ready" :aria-label="`Agendar a las ${slot.time}`" @click="openNew(slot.time)"><AppIcon name="plus" /></button><AppIcon v-else :name="slot.occupied ? 'lock' : slot.past ? 'clock' : 'check'" /></div></div>
      </section>
    </div>
    <DeliveryAppointmentDialog v-if="admin && dialogOpen" :appointment="editing" :date="selectedDate" :time="newTime" :article-id="linkedArticle" @saved="saved" @closed="close" @conflict="refresh()" />
  </div>
</template>
