import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { preconnectGoogleFonts } from '@/utils/fonts'
import './style.css'

preconnectGoogleFonts()

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
