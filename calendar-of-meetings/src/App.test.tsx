import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import App from './App.tsx';
import { createInMemoryMeetingsApi } from './lib/meetings/inMemory.ts';
import type { MeetingsApi } from './lib/meetings/api.ts';
import { APP_LOCALE } from './lib/date.ts';

const DATES_SETTINGS = { locale: APP_LOCALE };

/** `create` всегда падает — для проверки неудачной записи. */
function failingApi(): MeetingsApi {
  return {
    list: () => Promise.resolve([]),
    create: () => Promise.reject(new Error('нет связи')),
  };
}

// Своё хранилище на каждый тест (значение по умолчанию): записи не должны
// утекать между сценариями.
function renderApp(api: MeetingsApi = createInMemoryMeetingsApi()) {
  const view = render(
    <MantineProvider defaultColorScheme="dark">
      <DatesProvider settings={DATES_SETTINGS}>
        <App api={api} />
      </DatesProvider>
    </MantineProvider>
  );

  return { ...view, api };
}

/** Дни текущего месяца, в которые реально можно записаться. */
function bookableDays(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>(
    'tbody button:not([disabled]):not([data-outside])',
  ));
}

/** Открывает первый доступный день и возвращает его aria-label. */
async function openFirstBookableDay(
  user: ReturnType<typeof userEvent.setup>,
  container: HTMLElement,
): Promise<string> {
  let days = bookableDays(container);

  if (days.length === 0) {
    const next = container.querySelector<HTMLButtonElement>('[data-direction="next"]');
    expect(next).not.toBeNull();
    await user.click(next as HTMLButtonElement);
    days = bookableDays(container);
  }

  expect(days.length).toBeGreaterThan(0);
  const [day] = days;
  const label = day.getAttribute('aria-label');
  expect(label).not.toBeNull();

  await user.click(day);

  return label as string;
}

describe('календарь встреч', () => {
  it('показывает заголовок и подсказку', () => {
    renderApp();

    expect(screen.getByRole('heading', { name: 'Календарь встреч' })).toBeInTheDocument();
    expect(screen.getByText('Выберите дату для просмотра или создания события.')).toBeInTheDocument();
  });

  it('рендерит календарь в русской локали', () => {
    const { container } = renderApp();

    const labels = Array.from(container.querySelectorAll('tbody button'))
      .map((day) => day.getAttribute('aria-label') ?? '');
    expect(labels.some((label) => /^\d{1,2} [а-яё]+ \d{4}$/.test(label))).toBe(true);

    const weekdays = Array.from(container.querySelectorAll('.mantine-DatePicker-weekday'))
      .map((cell) => cell.textContent ?? '');
    expect(weekdays).toHaveLength(7);
    expect(weekdays.every((day) => /^[а-яё]{2}$/.test(day))).toBe(true);
  });

  it('выключает дни, в которые записаться нельзя', () => {
    const { container } = renderApp();

    const cells = Array.from(container.querySelectorAll<HTMLButtonElement>('tbody button'));
    expect(cells.length).toBeGreaterThan(0);

    for (const cell of cells) {
      if (cell.hasAttribute('data-weekend')) {
        expect(cell).toBeDisabled();
      }
    }
  });

  it('по клику по дню открывает выбор времени', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();

    expect(screen.queryByText('Выберите время для встречи')).not.toBeInTheDocument();

    await openFirstBookableDay(user, container);

    expect(await screen.findByText('Выберите время для встречи')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '09:00' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '17:30' })).toBeEnabled();
  });

  it('после выбора слота показывает запись и закрывает окно', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();

    const label = await openFirstBookableDay(user, container);

    await user.click(await screen.findByRole('button', { name: '11:00' }));
    await user.click(screen.getByRole('button', { name: 'Записаться' }));

    expect(await screen.findByText(`Запись: ${label}, 11:00`)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Выберите время для встречи')).not.toBeInTheDocument();
    });
  });

  it('отмена закрывает окно и не создаёт запись', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();

    await openFirstBookableDay(user, container);
    await user.click(await screen.findByRole('button', { name: '12:00' }));
    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    await waitFor(() => {
      expect(screen.queryByText('Выберите время для встречи')).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/^Запись:/)).not.toBeInTheDocument();
    expect(screen.getByText('Выберите дату, чтобы посмотреть свободные слоты.')).toBeInTheDocument();
  });

  it('занятый слот в следующий раз не выбирается', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();

    const label = await openFirstBookableDay(user, container);

    await user.click(await screen.findByRole('button', { name: '11:00' }));
    await user.click(screen.getByRole('button', { name: 'Записаться' }));
    await screen.findByText(`Запись: ${label}, 11:00`);

    const sameDay = container.querySelector<HTMLButtonElement>(`tbody button[aria-label="${label}"]`);
    expect(sameDay).not.toBeNull();
    await user.click(sameDay as HTMLButtonElement);

    expect(await screen.findByRole('button', { name: '11:00' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '13:00' })).toBeEnabled();
  });

  it('не показывает запись, если создание не удалось', async () => {
    const user = userEvent.setup();
    const { container } = renderApp(failingApi());

    await openFirstBookableDay(user, container);

    await user.click(await screen.findByRole('button', { name: '11:00' }));
    await user.click(screen.getByRole('button', { name: 'Записаться' }));

    expect(
      await screen.findByText('Не удалось создать запись. Выберите другое время.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Запись:/)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Выберите время для встречи')).not.toBeInTheDocument();
    });
  });

  it('выбор другой даты сбрасывает строку записи', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();

    const label = await openFirstBookableDay(user, container);

    await user.click(await screen.findByRole('button', { name: '11:00' }));
    await user.click(screen.getByRole('button', { name: 'Записаться' }));
    await screen.findByText(/^Запись:/);

    // Другой доступный день: следующий в этом месяце либо первый в следующем.
    let other = bookableDays(container)
      .find((day) => day.getAttribute('aria-label') !== label);

    if (other === undefined) {
      const next = container.querySelector<HTMLButtonElement>('[data-direction="next"]');
      expect(next).not.toBeNull();
      await user.click(next as HTMLButtonElement);
      other = bookableDays(container)[0];
    }

    expect(other).toBeDefined();
    await user.click(other as HTMLButtonElement);

    expect(screen.queryByText(/^Запись:/)).not.toBeInTheDocument();
    expect(
      screen.getByText('Выберите дату, чтобы посмотреть свободные слоты.')
    ).toBeInTheDocument();
  });
});