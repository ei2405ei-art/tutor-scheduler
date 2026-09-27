import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  // Локальная разработка — в корне. Прод на GitHub Pages лежит в подкаталоге
  // репозитория, имя которого кириллическое и потому percent-encoded, поэтому
  // абсолютный base пришлось бы хардкодить вместе с кодировкой. Относительный
  // base не зависит от имени репозитория и работает в любом подкаталоге.
  const base = mode === 'production' ? './' : '/';

  return {
    /*
      Точка входа — app/index.html, и она же корень vite: собранная страница
      получает имя dist/index.html, от которого зависят манифест, precache
      service worker и navigateFallback. Имя входного файла задаётся путём
      относительно root, ключом в rollupOptions.input не переименовать.

      Корневой index.html проекта занят самодостаточной сборкой для запуска
      двойным щелчком из папки — её пишет scripts/build-standalone.mjs.
    */
    root: 'app',
    publicDir: '../public',
    base,
    plugins: [
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [],
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
    build: {
      outDir: '../dist',
      emptyOutDir: true,
    },
    test: {
      // root смотрит в app/, а тесты лежат в tests/ рядом с исходниками.
      root: projectRoot,
      environment: 'jsdom',
      include: ['tests/**/*.test.ts'],
      restoreMocks: true,
    },
  };
});
