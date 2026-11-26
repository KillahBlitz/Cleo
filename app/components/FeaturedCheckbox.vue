<script setup lang="ts">
const value = defineModel<boolean>({ required: true })
</script>
<template><label class="featured-checkbox"><input v-model="value" type="checkbox" /><span>Destacar en la portada<small>Máximo 5 artículos</small></span><AppIcon name="star" /></label></template>
<style scoped>
.featured-checkbox{display:flex;align-items:center;gap:12px;margin:0;padding:12px 0;color:var(--text);font-size:13px;cursor:pointer}
.featured-checkbox input{appearance:auto;display:inline-block;flex:0 0 18px;width:18px;height:18px;min-height:18px;margin:0;padding:0;border-radius:3px;box-shadow:none;background:transparent;accent-color:var(--gold-fill)}
.featured-checkbox small{display:block;color:var(--muted);font-size:10px;font-weight:400;margin-top:4px}
.featured-checkbox .icon{width:18px;height:18px;color:var(--gold);margin-left:6px}
</style>
