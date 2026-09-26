import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  // Локальная разработка — в корне. Прод на GitHub Pages лежит в подкаталоге
  // репозитория, имя которого кириллическое и потому percent-encoded, поэтому
  // абсолютный base пришлось бы хардкодить вместе с кодировкой. Относительный
  // base не зависит от имени репозитория и работает в любом подкаталоге.
  const base = mode === 'production' ? './' : '/';

  return {
    base,
    plugins: [
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg'],
        manifest: {
          name: 'Планировщик занятий репетитора',
          short_name: 'Занятия',
          description: 'Локальное расписание занятий, переносы и учёт предоплаты',
          lang: 'ru',
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#f6f7f9',
          theme_color: '#2b5fd9',
          icons: [
            { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,ico,png}'],
          navigateFallback: 'index.html',
        },
      }),
    ],
    test: {
      environment: 'jsdom',
      include: ['tests/**/*.test.ts'],
      restoreMocks: true,
    },
  };
});
