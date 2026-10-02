<script setup lang="ts">
import AppHeader from './components/AppHeader.vue'
import SidebarMenu from './components/SidebarMenu.vue'
</script>

<template>
  <div class="layout">
    <SidebarMenu />
    <div class="layout__main">
      <AppHeader />
      <main class="layout__content">
        <RouterView v-slot="{ Component }">
          <component :is="Component" />
        </RouterView>
      </main>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.layout__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  height: 100%;
}

.layout__content {
  flex: 1;
  padding: 16px;
  overflow: auto;
  background: var(--mh-page-bg);
}
</style>
