import type { FavoriteList } from '~~/shared/types/activity'
import type { BidderProfile } from '~~/shared/types/store'
export function useFavorites() {
  const { data } = useNuxtData<FavoriteList>('bidder-favorites')
  const { data: profile } = useNuxtData<{ profile: BidderProfile | null }>('bidder-profile')
  const pending = useState<Record<string, boolean>>('favorite-pending', () => ({}))
  const errors = useState<Record<string, string>>('favorite-errors', () => ({}))
  const intent = useState<string | null>('favorite-intent', () => null)
  const profileOpen = useState<boolean>('profile-dialog-open', () => false)
  const isSaved = (id: string) => data.value?.ids.includes(id) === true
  async function setSaved(id: string, saved: boolean) {
    if (pending.value[id]) return
    errors.value[id] = ''
    if (!data.value?.signedIn && !profile.value?.profile) { intent.value = id; profileOpen.value = true; return }
    pending.value[id] = true
    try {
      await $fetch(`/api/public/favorites/${id}`, { method: 'PUT', body: { saved } })
      if (data.value) data.value.ids = saved ? [...new Set([...data.value.ids, id])] : data.value.ids.filter(value => value !== id)
      else await refreshNuxtData('bidder-favorites')
      await refreshNuxtData('personal-activity')
    } catch (e: any) {
      errors.value[id] = [400, 401, 404, 429].includes(e.statusCode) ? e.data?.statusMessage : 'No se pudo actualizar. Inténtalo de nuevo.'
      if (e.statusCode === 401) { intent.value = id; profileOpen.value = true }
    } finally { pending.value[id] = false }
  }
  return { data, isSaved, pending, errors, intent, setSaved }
}
