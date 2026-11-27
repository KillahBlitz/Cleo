export interface DeliveryAppointment {
  id: string
  date: string
  time: string
  startsAt: string
  endsAt: string
  recipientName: string
  location: string
  notes: string
  articleId: string | null
  articleTitle: string
  facebookUrl: string
  phone: string
  revision: number
}
export interface DeliveryCalendarData {
  month: string
  timeZone: string
  now: string
  busy: { date: string; time: string }[]
  appointments?: DeliveryAppointment[]
}
export interface DeliveryArticleOption {
  id: string
  title: string
  recipientName: string
  facebookUrl: string
  phone: string
  appointmentId: string | null
}
