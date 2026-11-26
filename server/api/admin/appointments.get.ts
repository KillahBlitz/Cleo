export default defineEventHandler(async event => { await requireAdmin(event); return deliveryCalendar(event, true) })
