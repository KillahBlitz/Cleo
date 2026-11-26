export function useMoney() {
  return (cents: number | null) => cents === null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100)
}
