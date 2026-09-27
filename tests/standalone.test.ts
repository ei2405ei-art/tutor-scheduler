import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
  Корневой index.html — самодостаточная сборка для запуска из папки, его пишет
  scripts/build-standalone.mjs. Тест ловит возврат к варианту, который открывается
  двойным щелчком как белый экран: внешние ссылки на сборку, манифест и
  service worker в нём быть не должно.
*/

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

describe('самодостаточный index.html', () => {
  const html = read('../index.html');

  it('встроен весь код: есть inline-скрипт и inline-стили', () => {
    expect(html).toContain('<script type="module">');
    expect(html).toContain('<style>');
  });

  it('не ссылается на файлы сборки, манифест и service worker', () => {
    expect(html).not.toContain('./assets/');
    expect(html).not.toContain('manifest.webmanifest');
    expect(html).not.toContain('registerSW');
    expect(html).not.toContain('src/main.ts');
  });

  it('помечен как сгенерированный', () => {
    expect(html).toContain('СГЕНЕРИРОВАНО АВТОМАТИЧЕСКИ');
  });

  it('иконка указывает на существующий файл в папке проекта', () => {
    expect(html).toContain('href="./public/icon.svg"');
    expect(read('../public/icon.svg')).toContain('<svg');
  });
});

describe('точка входа vite', () => {
  const entry = read('../app/index.html');

  it('лежит в app/ и подключает обвязку внутри корня vite', () => {
    expect(entry).toContain('src="./main.ts"');
  });

  it('обвязка ведёт к настоящей точке входа приложения', () => {
    expect(read('../app/main.ts')).toContain("import '../src/main.js'");
  });

  it('объясняет, где готовое приложение, при открытии файла из папки', () => {
    expect(entry).toContain('id="dev-file-notice"');
    expect(entry).toContain('location.protocol === \'file:\'');
  });
});
