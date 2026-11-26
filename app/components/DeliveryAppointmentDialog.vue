<script setup lang="ts">
import type { DeliveryAppointment, DeliveryArticleOption, DeliveryCalendarData } from '~~/shared/types/deliveries'
import { DELIVERY_TIMES, deliveryDate, deliveryEndTime } from '~~/shared/utils/deliveries'
const props = defineProps<{ appointment?: DeliveryAppointment; date: string; time: string; articleId?: string }>()
const emit = defineEmits<{ saved: [date: string]; closed: []; conflict: [] }>()
const dialog = ref<HTMLDialogElement>()
const date = ref(props.appointment?.date || props.date), time = ref(props.appointment?.time || props.time)
const article = ref(props.appointment?.articleId || props.articleId || '')
const recipientName = ref(props.appointment?.recipientName || ''), location = ref(props.appointment?.location || ''), notes = ref(props.appointment?.notes || '')
const pending = ref(false), error = ref(''), confirmingDelete = ref(false)
const { data: options, error: optionsError, refresh: refreshOptions } = useFetch<{ articles: DeliveryArticleOption[] }>('/api/admin/appointments/articles')
const { data: availability, error: availabilityError, refresh: refreshAvailability } = useFetch<DeliveryCalendarData>('/api/admin/appointments', { query: computed(() => ({ month: date.value.slice(0, 7) })), immediate: !!date.value })
const selectedArticle = computed(() => options.value?.articles.find(option => option.id === article.value))
const unavailable = (slot: string) => availability.value?.busy.some(busy => busy.date === date.value && busy.time === slot && !(props.appointment?.date === date.value && props.appointment.time === slot))
watch(selectedArticle, option => { if (option && (!props.appointment || option.id !== props.appointment.articleId)) recipientName.value = option.recipientName }, { immediate: true })
onMounted(() => dialog.value?.showModal())
function failure(e: any) { error.value = [400, 404, 409].includes(e.statusCode) ? e.data?.statusMessage : 'No se pudo guardar la cita.'; if (e.statusCode === 409) { refreshAvailability(); emit('conflict') } }
async function save() {
  if (pending.value) return
  pending.value = true; error.value = ''
  try {
    const result = await $fetch<DeliveryAppointment>(props.appointment ? `/api/admin/appointments/${props.appointment.id}` : '/api/admin/appointments', { method: props.appointment ? 'PATCH' : 'POST', body: { date: date.value, time: time.value, recipientName: recipientName.value, location: location.value, notes: notes.value, articleId: article.value || null, ...(props.appointment ? { revision: props.appointment.revision } : {}) } })
    emit('saved', result.date); dialog.value?.close()
  } catch (e) { failure(e) } finally { pending.value = false }
}
async function remove() {
  if (!props.appointment || pending.value) return
  pending.value = true; error.value = ''
  try { await $fetch(`/api/admin/appointments/${props.appointment.id}`, { method: 'DELETE', body: { revision: props.appointment.revision } }); emit('saved', props.appointment.date); dialog.value?.close() }
  catch (e) { failure(e) } finally { pending.value = false }
}
</script>
<template>
  <dialog ref="dialog" class="form-dialog delivery-dialog" aria-labelledby="delivery-form-title" @close="emit('closed')" @cancel="pending && $event.preventDefault()">
    <div class="card-heading"><h2 id="delivery-form-title">{{ confirmingDelete ? '¿Eliminar esta cita?' : appointment ? 'Editar cita' : 'Nueva cita' }}</h2><button class="neu-button icon-button" type="button" aria-label="Cerrar cita" :disabled="pending" @click="dialog?.close()"><AppIcon name="close" /></button></div>
    <template v-if="confirmingDelete"><p class="delete-name">{{ appointment?.recipientName }} · {{ appointment?.date }} · {{ appointment?.time }}</p><p class="field-hint">El horario volverá a estar disponible.</p><div class="form-actions"><button class="neu-button" :disabled="pending" @click="confirmingDelete = false">Volver</button><button class="neu-button danger-button" :disabled="pending" @click="remove">{{ pending ? 'Eliminando…' : 'Eliminar cita' }}</button></div></template>
    <form v-else class="admin-form delivery-form" :aria-busy="pending" @submit.prevent="save"><fieldset :disabled="pending">
      <div class="form-field"><label for="delivery-article">Artículo (opcional)</label><select id="delivery-article" v-model="article"><option value="">Cita sin artículo vinculado</option><option v-if="appointment?.articleId && !options?.articles.some(option => option.id === appointment?.articleId)" :value="appointment.articleId">{{ appointment.articleTitle }}</option><option v-for="option in options?.articles || []" :key="option.id" :value="option.id" :disabled="!!option.appointmentId && option.appointmentId !== appointment?.id">{{ option.title }}{{ option.appointmentId && option.appointmentId !== appointment?.id ? ' · Ya tiene cita' : '' }}</option></select><button v-if="optionsError" class="text-link" type="button" @click="refreshOptions()">Reintentar artículos</button></div>
      <div class="form-field"><label for="delivery-name">Nombre de la persona</label><input id="delivery-name" v-model="recipientName" required minlength="2" maxlength="60" autocomplete="off" /><a v-if="selectedArticle?.facebookUrl || appointment?.facebookUrl" class="text-link" :href="selectedArticle?.facebookUrl || appointment?.facebookUrl" target="_blank" rel="noopener noreferrer">Facebook<AppIcon name="external" /></a></div>
      <div class="form-grid"><div class="form-field"><label for="delivery-date">Día</label><input id="delivery-date" v-model="date" type="date" required :min="appointment && appointment.date < deliveryDate() ? appointment.date : deliveryDate()" /></div><div class="form-field"><label for="delivery-time">Horario</label><select id="delivery-time" v-model="time" required><option v-for="slot in DELIVERY_TIMES" :key="slot" :value="slot" :disabled="unavailable(slot)">{{ slot }}–{{ deliveryEndTime(slot) }}{{ unavailable(slot) ? ' · Ocupado' : '' }}</option></select></div></div>
      <p class="field-hint">Hora de Ciudad de México · 30 minutos</p><p v-if="availabilityError" class="field-hint">No se pudo actualizar la disponibilidad. <button class="text-link" type="button" @click="refreshAvailability()">Reintentar</button></p>
      <div class="form-field"><label for="delivery-location">Lugar de reunión</label><input id="delivery-location" v-model="location" required minlength="2" maxlength="300" placeholder="Dirección y punto de encuentro" /></div>
      <div class="form-field"><label for="delivery-notes">Notas (opcional)</label><textarea id="delivery-notes" v-model="notes" rows="3" maxlength="1000" /></div>
      <div class="form-actions"><button v-if="appointment" class="neu-button danger-button" type="button" @click="confirmingDelete = true"><AppIcon name="trash" />Eliminar</button><button class="neu-button primary-button" type="submit"><AppIcon :name="pending ? 'spinner' : 'check'" :class="{ spinning: pending }" />{{ pending ? 'Guardando…' : 'Guardar cita' }}</button></div>
    </fieldset></form><p v-if="error" class="error" role="alert">{{ error }}</p>
  </dialog>
</template>
