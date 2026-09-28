// Снимает демонстрационные скриншоты интерфейса в docs/screenshots/.
//
// Запускается вручную: `npm run screenshots`. В CI не выполняется, потому что
// требует браузер, а скриншоты меняются только вместе с интерфейсом.
//
// playwright-core намеренно не в зависимостях, чтобы установка проекта
// оставалась лёгкой. Перед первым запуском: `npm i -D playwright-core`.
// Браузер не скачивается: используется системный Chrome (channel: 'chrome').
//
// По умолчанию применяется к локальному превью (npm run preview), чтобы
// снимки соответствовали текущей сборке. Передаётся адрес первым аргументом:
//   node scripts/screenshots.mjs <папка вывода> [адрес страницы]
//
// Данные подставляются вымышленные: реальные имена и контакты учеников в
// репозиторий не попадают. Ключ хранилища совпадает с STORAGE_KEY из
// src/storage/schema.ts, иначе приложение прочитает состояние из своей копии.
//
// Приложение открывается на вкладке «День». Демо-неделя 28.09–04.10 построена
// так, что «сегодня» (28.09, понедельник) — первый её день, и на стартовом
// экране есть занятия. Данные сеются версией 1: схема 3 — новее, и миграция
// прогоняется на реальном приложении, как и в приёмочном сценарии.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const OUT = process.argv[2] ?? join(projectRoot, 'docs', 'screenshots');
const APP_URL = process.argv[3] ?? 'http://localhost:4173/';
const STORAGE_KEY = 'tutor-scheduler:state';

const { chromium } = await import('playwright-core').catch(() => {
  console.error('Нужен playwright-core: npm i -D playwright-core');
  process.exit(1);
});

mkdirSync(OUT, { recursive: true });

const ts = '2026-09-01T09:00:00.000Z';

/* Неделя 28.09–04.10: все статусы, перенос и заметки с домашним заданием.
   Дмитрий 30.09 — перенесённое занятие (l6 → l7), воскресенье 04.10 — занятие
   Анны. Люди намеренно не пересекаются: у границ один заканчивает, второй
   начинается. Вариант conflict=true ставит l2 утром на 17:00 28.09 — тогда
   появляется баннер «Пересечения в расписании». */
function demoState({ conflict = false } = {}) {
  const lessons = [
    { id: 'l1', studentId: 's1', date: '2026-09-28', startTime: '17:00', durationMin: 60, status: 'done', topicNote: 'Квадратные уравнения', homework: '№412–418', seriesId: 'ser1', movedToLessonId: null, movedFromLessonId: null, createdAt: ts, updatedAt: ts },
    { id: 'l2', studentId: 's2', date: '2026-09-28', startTime: conflict ? '17:00' : '19:00', durationMin: conflict ? 60 : 90, status: conflict ? 'planned' : 'done', topicNote: 'Кинематика', homework: 'Задачи 1–6', seriesId: null, movedToLessonId: null, movedFromLessonId: null, createdAt: ts, updatedAt: ts },
    { id: 'l3', studentId: 's3', date: '2026-09-29', startTime: '16:00', durationMin: 60, status: 'done', topicNote: 'Present Perfect', homework: 'Упражнение 7.1', seriesId: null, movedToLessonId: null, movedFromLessonId: null, createdAt: ts, updatedAt: ts },
    { id: 'l4', studentId: 's1', date: '2026-09-29', startTime: '18:00', durationMin: 60, status: 'done', topicNote: 'Параболы', homework: '', seriesId: null, movedToLessonId: null, movedFromLessonId: null, createdAt: ts, updatedAt: ts },
    { id: 'l5', studentId: 's4', date: '2026-09-30', startTime: '18:00', durationMin: 60, status: 'planned', topicNote: 'Массивы', homework: '', seriesId: null, movedToLessonId: null, movedFromLessonId: null, createdAt: ts, updatedAt: ts },
    { id: 'l6', studentId: 's2', date: '2026-09-30', startTime: '19:00', durationMin: 90, status: 'moved', topicNote: 'Динамика', homework: '', seriesId: null, movedToLessonId: 'l7', movedFromLessonId: null, createdAt: ts, updatedAt: ts },
    { id: 'l7', studentId: 's2', date: '2026-10-01', startTime: '19:00', durationMin: 90, status: 'planned', topicNote: 'Динамика (перенос)', homework: '', seriesId: null, movedToLessonId: null, movedFromLessonId: 'l6', createdAt: ts, updatedAt: ts },
    { id: 'l8', studentId: 's3', date: '2026-10-01', startTime: '16:00', durationMin: 60, status: 'done', topicNote: 'Времена группы Perfect', homework: 'Рассказ о поездке', seriesId: 'ser2', movedToLessonId: null, movedFromLessonId: null, createdAt: ts, updatedAt: ts },
    { id: 'l9', studentId: 's1', date: '2026-10-02', startTime: '17:00', durationMin: 60, status: 'planned', topicNote: 'Логарифмы', homework: '', seriesId: null, movedToLessonId: null, movedFromLessonId: null, createdAt: ts, updatedAt: ts },
    { id: 'l10', studentId: 's4', date: '2026-10-03', startTime: '12:00', durationMin: 60, status: 'planned', topicNote: 'Списки', homework: 'Задачи 12–15', seriesId: null, movedToLessonId: null, movedFromLessonId: null, createdAt: ts, updatedAt: ts },
    { id: 'l11', studentId: 's3', date: '2026-10-03', startTime: '14:00', durationMin: 60, status: 'cancelled', topicNote: 'Ученик заболел', homework: '', seriesId: null, movedToLessonId: null, movedFromLessonId: null, createdAt: ts, updatedAt: ts },
    { id: 'l12', studentId: 's1', date: '2026-10-04', startTime: '11:00', durationMin: 60, status: 'planned', topicNote: 'Показательная функция', homework: '', seriesId: null, movedToLessonId: null, movedFromLessonId: null, createdAt: ts, updatedAt: ts },
  ];
  return {
    version: 1,
    students: [
      { id: 's1', name: 'Анна', subject: 'Математика', contact: '@demo_anna', rate: 1500, color: 'blue', active: true, createdAt: ts },
      { id: 's2', name: 'Дмитрий', subject: 'Физика', contact: '@demo_dmitry', rate: 1700, color: 'green', active: true, createdAt: ts },
      { id: 's3', name: 'Вера', subject: 'Английский', contact: '@demo_vera', rate: 1200, color: 'purple', active: true, createdAt: ts },
      { id: 's4', name: 'Пётр', subject: 'Информатика', contact: '', rate: 1400, color: 'teal', active: true, createdAt: ts },
    ],
    series: [
      { id: 'ser1', studentId: 's1', weekday: 1, startTime: '17:00', durationMin: 60, startsOn: '2026-09-28', active: true, createdAt: ts },
      { id: 'ser2', studentId: 's3', weekday: 4, startTime: '16:00', durationMin: 60, startsOn: '2026-10-01', active: true, createdAt: ts },
    ],
    lessons,
    payments: [
      { id: 'p1', studentId: 's1', lessonsCount: 8, paidAt: '2026-09-01', comment: 'Пакет на сентябрь', createdAt: ts },
      { id: 'p2', studentId: 's2', lessonsCount: 1, paidAt: '2026-09-05', comment: 'Одно занятие', createdAt: ts },
      { id: 'p3', studentId: 's3', lessonsCount: 1, paidAt: '2026-09-10', comment: 'Одно занятие', createdAt: ts },
      { id: 'p4', studentId: 's4', lessonsCount: 2, paidAt: '2026-09-12', comment: '', createdAt: ts },
    ],
  };
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });

/* У приложения три вкладки: «День», «Неделя», «Ученики». Приложение открывается
   на «Дне». Часть снимков — они же с открытой нижней шторкой, отдельных
   страниц в навигации нет. */
async function open(viewport, { seed = true, state, waitFor = '[data-testid="day-view"]' } = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
  });
  if (seed) {
    const value = JSON.stringify(state ?? demoState());
    await context.addInitScript(
      ([key, value]) => {
        globalThis.localStorage.setItem(key, value);
      },
      [STORAGE_KEY, value],
    );
  }
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('ОШИБКА СТРАНИЦЫ:', e.message));
  await page.goto(APP_URL, { waitUntil: 'load' });
  await page.waitForSelector(waitFor, { timeout: 15000 });
  return { context, page };
}

async function openTab(page, tabTestId, contentSelector) {
  await page.locator(`[data-testid="${tabTestId}"]`).click();
  await page.waitForSelector(contentSelector);
}

const taken = [];
async function shot(page, name) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(OUT, name) });
  taken.push(name);
  console.log('снимок:', name);
}

/* 0. Первый запуск: пустой «День» и где вводить данные */
{
  const { context, page } = await open({ width: 390, height: 844 }, { seed: false, waitFor: '[data-testid="day-empty-firstrun"]' });
  await shot(page, '00-day-empty.png');

  await openTab(page, 'tab-students', '[data-testid="student-card"], .empty-panel');
  await shot(page, '07-empty.png');
  await context.close();
}

/* 1–5. Демо-данные на 390 px: «День», «Неделя» и «Ученики» с шторками */
{
  const { context, page } = await open({ width: 390, height: 844 });
  await shot(page, '08-day.png');

  await page.locator('[data-testid="lesson-card"]').first().click();
  await page.waitForSelector('[data-testid="lesson-sheet"]');
  await shot(page, '02-lesson.png');
  await page.keyboard.press('Escape');

  await openTab(page, 'tab-week', '[data-testid="week-grid"]');
  await shot(page, '01-week.png');

  await openTab(page, 'tab-students', '[data-testid="student-card"]');
  await shot(page, '03-students.png');

  await page.locator('[data-testid="student-card"]').first().click();
  await page.waitForSelector('[data-testid="student-card"][role="dialog"]');
  await shot(page, '04-student-card.png');
  await page.keyboard.press('Escape');

  await openTab(page, 'tab-week', '[data-testid="week-grid"]');
  await page.locator('[data-testid="fab"]').click();
  await page.waitForSelector('[data-testid="new-lesson-sheet"]');
  await page.locator('label[for="mode-series"]').click();
  await page.waitForTimeout(200);
  await shot(page, '05-new-series.png');

  await context.close();
}

/* 6. Та же неделя на минимальной ширине 320 px */
{
  const { context, page } = await open({ width: 320, height: 640 }, { waitFor: '[data-testid="day-view"]' });
  await openTab(page, 'tab-week', '[data-testid="week-grid"]');
  await shot(page, '06-week-320.png');
  await context.close();
}

/* 9. Пересечение в данных: баннер «Пересечения в расписании» и его шторка */
{
  const { context, page } = await open({ width: 390, height: 844 }, { state: demoState({ conflict: true }), waitFor: '[data-testid="conflicts-banner"]' });
  await page.locator('[data-testid="conflicts-open"]').click();
  await page.waitForSelector('[data-testid="conflicts-sheet"]');
  await shot(page, '09-conflicts.png');
  await context.close();
}

await browser.close();
console.log('готово:', taken.length, 'снимков в', OUT);