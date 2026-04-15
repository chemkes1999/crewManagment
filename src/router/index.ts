import DashboardPage from '@/pages/DashboardPage.vue'
import LoginPage from '@/pages/LoginPage.vue'
import ProjectPage from '@/pages/ProjectPage.vue'
import TeamsTimePage from '@/pages/TeamsTimePage.vue'
import { useAuthStore } from '@/stores/auth'
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

// 定义路由配置
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: DashboardPage,
    meta: { requiresAuth: true },
  },
  {
    path: '/login',
    name: 'login',
    component: LoginPage,
  },
  {
    path: '/projects/:projectId',
    name: 'project',
    component: ProjectPage,
    meta: { requiresAuth: true },
  },
  {
    path: '/teams-time',
    name: 'teams-time',
    component: TeamsTimePage,
    meta: { requiresAuth: true },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

// 创建路由实例
const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.waitUntilReady()
  const unauthorized = to.query.reason === 'unauthorized'

  if (to.meta?.requiresAuth && !auth.session) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.name === 'login' && auth.session && !unauthorized) {
    return { name: 'home' }
  }
})

export default router
