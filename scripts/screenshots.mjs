// Снимает демонстрационные скриншоты интерфейса в docs/screenshots/.
//
// Запускается вручную: `npm run screenshots`. В CI не выполняется, потому что
// требует браузер, а скриншоты меняются только вместе с интерфейсом.
//
// playwright-core намеренно не в зависимостях, чтобы установка проекта
// оставалась лёгкой. Перед первым запуском: `npm i -D playwright-core`.
// Браузер не скачивается: используется системный Chrome (channel: 'chrome').
//
// Данные подставляются вымышленные: реальные имена и контакты учеников в
// репозиторий не попадают. Ключ хранилища совпадает с STORAGE_KEY из
// src/storage/schema.ts, иначе приложение прочитает состояние из своей копии.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const OUT = process.argv[2] ?? join(projectRoot, 'docs', 'screenshots');
const APP_URL = process.argv[3] ?? 'https://ei2405ei-art.github.io/tutor-scheduler/';
const STORAGE_KEY = 'tutor-scheduler:state';

const { chromium } = await import('playwright-core').catch(() => {
  console.error('Нужен playwright-core: npm i -D playwright-core');
  process.exit(1);
});

mkdirSync(OUT, { recursive: true });

const ts = '2026-09-01T09:00:00.000Z';

/* Неделя 21–27 сентября: все статусы, перенос и заметки с домашним заданием. */
const state = {
  version: 1,
  students: [
    { id: 's1', name: 'Анна', subject: 'Математика', contact: '@demo_anna', rate: 1500, color: 'blue', active: true, createdAt: ts },
    { id: 's2', name: 'Дмитрий', subject: 'Физика', contact: '@demo_dmitry', rate: 1700, color: 'green', active: true, createdAt: ts },
    { id: 's3', name: 'Вера', subject: 'Английский', contact: '@demo_vera', rate: 1200, color: 'purple', active: true, createdAt: ts },
    { id: 's4', name: 'Пётр', subject: 'Информатика', contact: '', rate: 1400, color: 'teal', active: true, createdAt: ts },
  ],
  series: [
    { id: 'ser1', studentId: 's1', weekday: 1, startTime: '17:00', durationMin: 60, startsOn: '2026-09-21', active: true, createdAt: ts },
    { id: 'ser2', studentId: 's3', weekday: 4, startTime: '16:00', durationMin: 60, startsOn: '2026-09-24', active: true, createdAt: ts },
  ],
  lessons: [
    { id: 'l1', studentId: 's1', date: '2026-09-21', startTime: '17:00', durationMin: 60, status: 'done', topicNote: 'Квадратные уравнения', homework: '№412–418', seriesId: 'ser1', movedToLessonId: null, movedFromLessonId: null, createdAt: ts, updatedAt: ts },
    { id: 'l2', studentId: 's2', date: '2026-09-21', startTime: '19:00', durationMin: 90, status: 'done', topicNote: 'Кинематика', homework: 'Задачи 1–6', seriesId: null, movedToLessonId: null, movedFromLessonId: null, createdAt: ts, updatedAt: ts },
    { id: 'l3', studentId: 's3', date: '2026-09-22', startTime: '16:00', durationMin: 60, status: 'done', topicNote: 'Present Perfect', homework: 'Упражнение 7.1', seriesId: null, movedToLessonId: null, movedFromLessonId: null, createdAt: ts, updatedAt: ts },
    { id: 'l4', studentId: 's1', date: '2026-09-22', startTime: '18:00', durationMin: 60, status: 'done', topicNote: 'Параболы', homework: '', seriesId: null, movedToLessonId: null, movedFromLessonId: null, createdAt: ts, updatedAt: ts },
    { id: 'l5', studentId: 's4', date: '2026-09-23', startTime: '18:30', durationMin: 60, status: 'planned', topicNote: 'Массивы', homework: '', seriesId: null, movedToLessonId: null, movedFromLessonId: null, createdAt: ts, updatedAt: ts },
    { id: 'l6', studentId: 's2', date: '2026-09-23', startTime: '19:00', durationMin: 90, status: 'moved', topicNote: 'Динамика', homework: '', seriesId: null, movedToLessonId: 'l7', movedFromLessonId: null, createdAt: ts, updatedAt: ts },
    { id: 'l7', studentId: 's2', date: '2026-09-24', startTime: '19:00', durationMin: 90, status: 'planned', topicNote: 'Динамика (перенос)', homework: '', seriesId: null, movedToLessonId: null, movedFromLessonId: 'l6', createdAt: ts, updatedAt: ts },
    { id: 'l8', studentId: 's3', date: '2026-09-24', startTime: '16:00', durationMin: 60, status: 'done', topicNote: 'Времена группы Perfect', homework: 'Рассказ о поездке', seriesId: 'ser2', movedToLessonId: null, movedFromLessonId: null, createdAt: ts, updatedAt: ts },
    { id: 'l9', studentId: 's1', date: '2026-09-25', startTime: '17:00', durationMin: 60, status: 'planned', topicNote: 'Логарифмы', homework: '', seriesId: null, movedToLessonId: null, movedFromLessonId: null, createdAt: ts, updatedAt: ts },
    { id: 'l10', studentId: 's4', date: '2026-09-26', startTime: '12:00', durationMin: 60, status: 'planned', topicNote: 'Списки', homework: 'Задачи 12–15', seriesId: null, movedToLessonId: null, movedFromLessonId: null, createdAt: ts, updatedAt: ts },
    { id: 'l11', studentId: 's3', date: '2026-09-26', startTime: '14:00', durationMin: 60, status: 'cancelled', topicNote: 'Ученик заболел', homework: '', seriesId: null, movedToLessonId: null, movedFromLessonId: null, createdAt: ts, updatedAt: ts },
    { id: 'l12', studentId: 's1', date: '2026-09-27', startTime: '11:00', durationMin: 60, status: 'planned', topicNote: 'Показательная функция', homework: '', seriesId: null, movedToLessonId: null, movedFromLessonId: null, createdAt: ts, updatedAt: ts },
  ],
  payments: [
    { id: 'p1', studentId: 's1', lessonsCount: 8, paidAt: '2026-09-01', comment: 'Пакет на сентябрь', createdAt: ts },
    { id: 'p2', studentId: 's2', lessonsCount: 1, paidAt: '2026-09-05', comment: 'Одно занятие', createdAt: ts },
    { id: 'p3', studentId: 's3', lessonsCount: 1, paidAt: '2026-09-10', comment: 'Одно занятие', createdAt: ts },
    { id: 'p4', studentId: 's4', lessonsCount: 2, paidAt: '2026-09-12', comment: '', createdAt: ts },
  ],
};

const seeded = JSON.stringify(state);
const browser = await chromium.launch({ channel: 'chrome', headless: true });

/* Две страницы приложения: «Неделя» и «Ученики». Часть снимков — они же с
   открытой нижней шторкой, отдельных страниц в навигации нет. */
async function open(viewport, { seed = true, waitForGrid = true } = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
  });
  if (seed) {
    await context.addInitScript(
      ([key, value]) => {
        globalThis.localStorage.setItem(key, value);
      },
      [STORAGE_KEY, seeded],
    );
  }
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('ОШИБКА СТРАНИЦЫ:', e.message));
  await page.goto(APP_URL, { waitUntil: 'load' });
  await page.waitForSelector(waitForGrid ? '.week__grid' : '[data-testid="week-empty"]', {
    timeout: 15000,
  });
  return { context, page };
}

const taken = [];
async function shot(page, name) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(OUT, name) });
  taken.push(name);
  console.log('снимок:', name);
}

/* 0. Первый запуск: пустое расписание вместо семи дней */
{
  const { context, page } = await open({ width: 390, height: 844 }, { seed: false, waitForGrid: false });
  await shot(page, '00-week-empty.png');
  await context.close();
}

/* 1–5. Страница «Неделя» и страница «Ученики» с шторками, 390 px */
{
  const { context, page } = await open({ width: 390, height: 844 });
  await shot(page, '01-week.png');

  await page.locator('[data-testid="lesson-card"]', { hasText: 'Списки' }).first().click();
  await page.waitForSelector('[data-testid="lesson-sheet"]');
  await shot(page, '02-lesson.png');
  await page.keyboard.press('Escape');

  await page.locator('[data-testid="tab-students"]').click();
  await page.waitForSelector('[data-testid="student-card"]');
  await shot(page, '03-students.png');

  await page.locator('[data-testid="student-card"]').first().click();
  await page.waitForSelector('[data-testid="student-card"][role="dialog"]');
  await shot(page, '04-student-card.png');
  await page.keyboard.press('Escape');

  await page.locator('[data-testid="tab-week"]').click();
  await page.locator('[data-testid="fab"]').click();
  await page.waitForSelector('[data-testid="new-lesson-sheet"]');
  await page.locator('label[for="mode-series"]').click();
  await page.waitForTimeout(200);
  await shot(page, '05-new-series.png');

  await context.close();
}

/* 6. Та же неделя на минимальной ширине 320 px */
{
  const { context, page } = await open({ width: 320, height: 640 });
  await shot(page, '06-week-320.png');
  await context.close();
}

/* 7. Пустое состояние «Учеников» без демо-данных */
{
  const { context, page } = await open({ width: 390, height: 844 }, { seed: false, waitForGrid: false });
  await page.locator('[data-testid="tab-students"]').click();
  await page.waitForSelector('.empty-panel');
  await shot(page, '07-empty.png');
  await context.close();
}

await browser.close();
console.log('готово:', taken.length, 'снимков в', OUT);
