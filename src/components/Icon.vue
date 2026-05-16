<script setup lang="ts">
// Hand-picked inline SVG icons. Same viewBox 24x24, 1.6 stroke. We
// intentionally avoid pulling a full icon library — under 15 icons
// total fits in this file's body without bloating bundle size.

type IconName =
  | 'type' | 'image' | 'undo' | 'redo' | 'duplicate' | 'trash'
  | 'bringFront' | 'sendBack' | 'mic' | 'inspector' | 'page'
  | 'check'

const props = withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 16 })

const PATHS: Record<IconName, string> = {
  type: '<path d="M4 6h16M12 6v14M8 20h8" />',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 1 1 0 10h-4"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 1 0 0 10h4"/>',
  duplicate: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M5 7l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
  bringFront: '<rect x="8" y="8" width="12" height="12" rx="2"/><rect x="4" y="4" width="12" height="12" rx="2" fill="currentColor" opacity="0.3"/>',
  sendBack: '<rect x="4" y="4" width="12" height="12" rx="2"/><rect x="8" y="8" width="12" height="12" rx="2" fill="currentColor" opacity="0.3"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
  inspector: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16M18 9h-1M18 13h-1M18 17h-1"/>',
  page: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
}
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="PATHS[props.name]"
  />
</template>
