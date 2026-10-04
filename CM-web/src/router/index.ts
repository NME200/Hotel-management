import { createRouter, createWebHistory } from 'vue-router'

import { setupRouterGuard } from './guard'
import { routes } from './routes'

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

setupRouterGuard(router)

export default router
