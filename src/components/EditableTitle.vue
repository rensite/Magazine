<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{
  value: string
  placeholder?: string
  inputClass?: string
  textClass?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  commit: [value: string]
}>()

const editing = ref(false)
const draft = ref(props.value)
const inputRef = ref<HTMLInputElement | null>(null)

watch(
  () => props.value,
  (next) => {
    if (!editing.value) draft.value = next
  },
)

const begin = async () => {
  if (props.disabled) return
  draft.value = props.value
  editing.value = true
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()
}

const cancel = () => {
  draft.value = props.value
  editing.value = false
}

const commit = () => {
  const next = draft.value.trim()
  editing.value = false
  if (next && next !== props.value) emit('commit', next)
  else draft.value = props.value
}

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    commit()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancel()
  }
}
</script>

<template>
  <input
    v-if="editing"
    ref="inputRef"
    v-model="draft"
    :class="inputClass"
    :placeholder="placeholder"
    @blur="commit"
    @keydown="onKey"
    @click.stop
  />
  <span
    v-else
    :class="textClass"
    :title="disabled ? undefined : 'Двойной клик — переименовать'"
    @dblclick.stop="begin"
  >{{ value || placeholder || '—' }}</span>
</template>
