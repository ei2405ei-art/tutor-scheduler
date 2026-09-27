// Собирает самодостаточный index.html в корне проекта: встраивает CSS и JS
// прямо в страницу, чтобы приложение запускалось двойным щелчком из папки.
//
// Зачем: приложение — браузерный PWA, и исходный index.html нельзя открыть
// как файл (браузер не выполняет TypeScript, а service worker и модули по
// file: заблокированы). Проверено, что по file: работает inline-модуль и
// localStorage, поэтому единственный файл без сборки и сервера — полноценное
// приложение. Чего не будет: service worker, офлайн-режим и установка PWA —
// для них нужен http(s), то есть опубликованная версия или `npm run dev`.
//
// Собирается из dist/index.html, поэтому поведение папной версии совпадает с
// опубликованной. Запускается автоматически из `npm run build`.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const distHtml = path.join(projectRoot, 'dist', 'index.html');
const targetHtml = path.join(projectRoot, 'index.html');

const BANNER = [
  '<!--',
  '  СГЕНЕРИРОВАНО АВТОМАТИЧЕСКИ, ПРАВИТЬ ВРУЧНУЮ НЕЛЬЗЯ.',
  '',
  '  Источники: app/index.html, src/, public/. Пересобрать: npm run build.',
  '',
  '  Это самодостаточная версия для запуска из папки: CSS и JS встроены в',
  '  страницу. Опубликованная версия и PWA собираются в dist/ и отдаются по',
  '  http(s), где дополнительно доступны офлайн-режим и установка на экран.',
  '-->',
].join('\n');

const fail = (message) => {
  throw new Error(`build-standalone: ${message}`);
};

const readIfExists = async (file) => {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};

const collect = (html, pattern) => {
  const found = [];
  for (const match of html.matchAll(pattern)) found.push(match);
  return found;
};

// Replacer-функция нужна в replace ниже, чтобы `$&` и `$1` внутри
// минифицированного кода не трактовались как подстановки Replacement Patterns.
const loadAsset = async (href) => {
  const file = path.join(path.dirname(distHtml), href.replace(/^\.\//, ''));
  const content = await readIfExists(file);
  if (content === null) fail(`сборка ссылается на отсутствующий файл ${href}`);
  // `</script>` внутри встроенного кода закрыл бы тег раньше времени.
  if (content.includes('</script')) fail(`код ${href} содержит </script и не встраивается`);
  return content;
};

const main = async () => {
  const html = await readIfExists(distHtml);
  if (html === null) fail(`нет ${distHtml}, сначала выполните vite build`);

  let out = html;

  // Служебное для Pages: манифест, регистрация service worker и подсказка для
  // режима разработки в папочную версию не переносятся.
  out = out.replace(/<link rel="manifest"[^>]*>/g, '');
  out = out.replace(/<script id="vite-plugin-pwa:register-sw"[^>]*><\/script>/g, '');
  out = out.replace(/<script id="dev-file-notice">[\s\S]*?<\/script>/g, '');

  const styles = collect(out, /<link[^>]*rel="stylesheet"[^>]*>/g);
  for (const [tag] of styles) {
    const href = /href="([^"]+)"/.exec(tag)?.[1];
    if (!href) fail(`не найден href у ${tag}`);
    const css = await loadAsset(href);
    out = out.replace(tag, `<style>\n${css}\n</style>`);
  }

  const scripts = collect(out, /<script[^>]*src="([^"]+)"[^>]*><\/script>/g);
  for (const [tag, href] of scripts) {
    const js = await loadAsset(href);
    out = out.replace(tag, `<script type="module">\n${js}\n</script>`);
  }

  if (styles.length === 0 || scripts.length === 0) {
    fail('в dist/index.html не нашлось ни стилей, ни скриптов для встраивания');
  }

  // Иконка лежит в public/, рядом с корневым index.html её нет.
  out = out.replace(/href="\.\/icon\.svg"/g, 'href="./public/icon.svg"');

  // Комментарий точки входа описывает dev-сборку — в папочной версии он не нужен.
  out = out.replace(/<!--[\s\S]*?-->/g, (comment) => (comment.includes('vite dev') ? '' : comment));
  out = out.replace('<!doctype html>', `<!doctype html>\n${BANNER}`);

  const leftovers = out.match(/(?:src|href)="\.{0,2}\/(?:assets|manifest|registerSW)[^"]*"/g);
  if (leftovers) fail(`остались внешние ссылки: ${leftovers.join(', ')}`);

  await writeFile(targetHtml, out, 'utf8');
  process.stdout.write(
    `build-standalone: index.html ${(out.length / 1024).toFixed(1)} КБ, ` +
      `встроено стилей ${styles.length}, скриптов ${scripts.length}\n`,
  );
};

await main();
