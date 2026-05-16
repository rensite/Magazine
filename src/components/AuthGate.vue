<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'

const auth = useAuthStore()
const email = ref('')

const submit = () => {
  if (!email.value || auth.signingIn) return
  void auth.signInWithOtp(email.value.trim())
}
</script>

<template>
  <div class="flex h-full w-full items-center justify-center bg-ink-900">
    <div class="w-full max-w-sm rounded-lg border border-ink-700 bg-ink-800 p-6 shadow-2xl">
      <h1 class="font-serif text-xl italic text-gold">Stan Book Editor</h1>
      <p class="mt-2 text-sm text-ink-300">
        Введи email — пришлём ссылку для входа.
      </p>
      <form class="mt-4 flex flex-col gap-3" @submit.prevent="submit">
        <input
          v-model="email"
          type="email"
          required
          autofocus
          placeholder="you@example.com"
          class="rounded bg-ink-700 px-3 py-2 text-sm text-ink-100 outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          :disabled="auth.signingIn || !email"
          class="rounded bg-accent px-3 py-2 text-sm font-medium text-ink-900 hover:bg-accent/90 disabled:opacity-50"
        >
          {{ auth.signingIn ? 'Отправка…' : 'Прислать ссылку' }}
        </button>
      </form>
      <p v-if="auth.signInSent" class="mt-3 text-xs text-emerald-400">
        Готово. Проверь почту и открой ссылку в этом же браузере.
      </p>
      <p v-if="auth.signInError" class="mt-3 text-xs text-red-400">
        {{ auth.signInError }}
      </p>
    </div>
  </div>
</template>
