export const DELIVERY_TIME_ZONE = 'America/Mexico_City'
export const DELIVERY_TIMES = Array.from({ length: 16 }, (_, i) => `${String(10 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)
const localParts = new Intl.DateTimeFormat('en-CA', { timeZone: DELIVERY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
function parts(value: Date | number) { return Object.fromEntries(localParts.formatToParts(value).map(part => [part.type, part.value])) }
export function deliveryDate(value: Date | number = new Date()) { const p = parts(value); return `${p.year}-${p.month}-${p.day}` }
export function validDeliveryDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(20\d{2}|2100)-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
// Resolve the business time zone independently of the browser/server time zone.
export function deliveryStart(date: string, time: string) {
  const target = Date.parse(`${date}T${time}:00.000Z`)
  let instant = target
  for (let i = 0; i < 3; i++) {
    const p = parts(instant)
    const local = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00.000Z`)
    const adjustment = target - local
    instant += adjustment
    if (!adjustment) break
  }
  return new Date(instant)
}
export function deliveryEndTime(time: string) { const [hour = 0, minute = 0] = time.split(':').map(Number); const total = hour * 60 + minute + 30; return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}` }
export function deliveryDateLabel(date: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) { return new Intl.DateTimeFormat('es-MX', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)) }
export function deliveryMonthDays(month: string) { const [year = 0, number = 0] = month.split('-').map(Number); return new Date(Date.UTC(year, number, 0)).getUTCDate() }
