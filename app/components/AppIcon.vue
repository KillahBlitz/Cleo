<script setup lang="ts">
export type IconName = 'sun' | 'moon' | 'lock' | 'spinner' | 'sparkle' | 'grid' | 'hanger' | 'gavel' | 'clock' | 'check' | 'logout' | 'search' | 'refresh' | 'chevron-left' | 'chevron-right' | 'user' | 'external' | 'box' | 'bag' | 'plus' | 'close' | 'image' | 'star' | 'facebook' | 'edit' | 'trash' | 'calendar' | 'pin' | 'heart' | 'activity' | 'map' | 'minus' | 'download'
defineProps<{ name: IconName }>()
</script>
<template>
  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <template v-if="name === 'map'"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16" /></template>
    <path v-else-if="name === 'minus'" d="M5 12h14" />
    <path v-else-if="name === 'download'" d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" />
    <path v-else-if="name === 'heart'" d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
    <template v-else-if="name === 'activity'"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8m-8 4h4" /></template>
    <template v-else-if="name === 'calendar'"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18M7 15h2m3 0h2m3 0h1M7 18h2m3 0h2" /></template>
    <template v-else-if="name === 'pin'"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></template>
    <path v-else-if="name === 'edit'" d="m14 4 6 6M4 20l5-1L21 7l-4-4L5 15Zm0 0 1-5" />
    <path v-else-if="name === 'trash'" d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" />
    <path v-else-if="name === 'star'" d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />
    <path v-else-if="name === 'facebook'" d="M14 21v-8h3l.5-4H14V7c0-1 .5-2 2-2h2V2h-3c-3 0-5 2-5 5v2H7v4h3v8" />
    <path v-else-if="name === 'plus'" d="M12 5v14M5 12h14" />
    <path v-else-if="name === 'close'" d="m6 6 12 12M6 18 18 6" />
    <template v-else-if="name === 'image'"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 6-6 4 4 3-3 5 5" /></template>
    <template v-else-if="name === 'sun'"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></template>
    <path v-else-if="name === 'moon'" d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z" />
    <template v-else-if="name === 'lock'"><rect x="5" y="10" width="14" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></template>
    <template v-else-if="name === 'spinner'"><circle cx="12" cy="12" r="8" opacity=".25" /><path d="M12 4a8 8 0 0 1 8 8" /></template>
    <template v-else-if="name === 'grid'"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></template>
    <path v-else-if="name === 'hanger'" d="M9.5 7a2.5 2.5 0 1 1 4.1 1.9c-.9.7-1.6 1.1-1.6 2.6L3.5 17a1.5 1.5 0 0 0 .8 2.8h15.4a1.5 1.5 0 0 0 .8-2.8L12 11.5" />
    <template v-else-if="name === 'gavel'"><path d="m5 9 7-7 6 6-7 7zM8.5 5.5l6 6m-.5 1.5 7 7M3 21h11M5 18h7v3" /></template>
    <template v-else-if="name === 'clock'"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></template>
    <template v-else-if="name === 'check'"><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></template>
    <path v-else-if="name === 'logout'" d="M10 4H5v16h5m-1-8h12m-4-4 4 4-4 4" />
    <template v-else-if="name === 'search'"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></template>
    <path v-else-if="name === 'refresh'" d="M20 8a8 8 0 1 0 0 8m0-13v5h-5" />
    <path v-else-if="name === 'chevron-left'" d="m15 6-6 6 6 6" />
    <path v-else-if="name === 'chevron-right'" d="m9 6 6 6-6 6" />
    <template v-else-if="name === 'user'"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></template>
    <path v-else-if="name === 'external'" d="M14 3h7v7m0-7L11 13m-1-9H4v16h16v-6" />
    <template v-else-if="name === 'bag'"><path d="M5 7h14l1 14H4zM9 8V6a3 3 0 0 1 6 0v2" /></template>
    <path v-else-if="name === 'box'" d="m3 7 9-4 9 4v10l-9 4-9-4zm0 0 9 4 9-4m-9 4v10M7.5 5l9 4" />
    <path v-else d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8Z" />
  </svg>
</template>
