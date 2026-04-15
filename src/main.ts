import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import './style.css'

// 创建Vue应用实例
const app = createApp(App)

// 使用路由
app.use(createPinia())
app.use(router)

useAuthStore().init()

// 挂载应用
app.mount('#app')
