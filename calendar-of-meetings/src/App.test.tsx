import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import App from './App.tsx';
import { createInMemoryMeetingsApi } from './lib/meetings/inMemory.ts';
import type { MeetingsApi } from './lib/meetings/api.ts';
import { createInMemorySessionApi } from './lib/session/inMemory.ts';
import type { SessionApi } from './lib/session/api.ts';
import type { Session } from './lib/session/types.ts';
import { APP_LOCALE } from './lib/date.ts';

const DATES_SETTINGS = { locale: APP_LOCALE };

/** Уже вошедший гость — сессия по умолчанию для «календарных» тестов (T6). */
function guestSession(): SessionApi {
  return createInMemorySessionApi({ role: 'guest', bookerName: 'Тест' });
}

/** Никогда не отвечает — для проверки состояния «восстановление сессии». */
function pending<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

/** `create` всегда падает — для проверки неудачной записи. */
function failingApi(): MeetingsApi {
  return {
    list: () => Promise.resolve([]),
    create: () => Promise.reject(new Error('нет связи')),
  };
}

// Своё хранилище на каждый тест (значения по умолчанию): записи и сессии не
// должны утекать между сценариями.
async function renderApp(
  api: MeetingsApi = createInMemoryMeetingsApi(),
  sessionApi: SessionApi = guestSession(),
) {
  const view = render(
    <MantineProvider defaultColorScheme="dark">
      <DatesProvider settings={DATES_SETTINGS}>
        <App api={api} sessionApi={sessionApi} />
      </DatesProvider>
    </MantineProvider>
  );

  // Первая отрисовка — «Восстановление сессии…» (роль ещё неизвестна, C9):
  // ждём ответа GET /api/me, иначе проверки ниже ловят экран загрузки.
  await waitFor(() => {
    expect(screen.queryByText('Восстановление сессии…')).not.toBeInTheDocument();
  });

  return { ...view, api, sessionApi };
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
  it('показывает заголовок и подсказку', async () => {
    await renderApp();

    expect(screen.getByRole('heading', { name: 'Календарь встреч' })).toBeInTheDocument();
    expect(screen.getByText('Выберите дату для просмотра или создания события.')).toBeInTheDocument();
  });

  it('рендерит календарь в русской локали', async () => {
    const { container } = await renderApp();

    const labels = Array.from(container.querySelectorAll('tbody button'))
      .map((day) => day.getAttribute('aria-label') ?? '');
    expect(labels.some((label) => /^\d{1,2} [а-яё]+ \d{4}$/.test(label))).toBe(true);

    const weekdays = Array.from(container.querySelectorAll('.mantine-DatePicker-weekday'))
      .map((cell) => cell.textContent ?? '');
    expect(weekdays).toHaveLength(7);
    expect(weekdays.every((day) => /^[а-яё]{2}$/.test(day))).toBe(true);
  });

  it('выключает дни, в которые записаться нельзя', async () => {
    const { container } = await renderApp();

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
    const { container } = await renderApp();

    expect(screen.queryByText('Выберите время для встречи')).not.toBeInTheDocument();

    await openFirstBookableDay(user, container);

    expect(await screen.findByText('Выберите время для встречи')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '09:00' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '17:30' })).toBeEnabled();
  });

  it('после выбора слота показывает запись и закрывает окно', async () => {
    const user = userEvent.setup();
    const { container } = await renderApp();

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
    const { container } = await renderApp();

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
    const { container } = await renderApp();

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
    const { container } = await renderApp(failingApi());

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
    const { container } = await renderApp();

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

  it('не вошедшему показывает экран входа вместо календаря (Q12a)', async () => {
    await renderApp(createInMemoryMeetingsApi(), createInMemorySessionApi(null));

    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Пароль/)).toBeInTheDocument();
    expect(
      screen.queryByText('Выберите дату для просмотра или создания события.')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Гость')).not.toBeInTheDocument();
  });

  it('вход гостем: имя подставляется в запрос и открывается гостевой вид', async () => {
    const user = userEvent.setup();
    const sessionApi = createInMemorySessionApi(null);
    const login = vi.spyOn(sessionApi, 'login');
    await renderApp(createInMemoryMeetingsApi(), sessionApi);

    // Имя гостя прячется за переключателем (D4) — без него гостевой вид
    // не собрать: сервер для гостя требует bookerName.
    expect(screen.queryByLabelText(/^Ваше имя/)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Я гость'));
    await user.type(screen.getByLabelText(/^Ваше имя/), 'Иван');
    await user.type(screen.getByLabelText(/^Пароль/), 'guest');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(login).toHaveBeenCalledWith({ password: 'guest', bookerName: 'Иван' });
    expect(await screen.findByText('Гость')).toBeInTheDocument();
    expect(
      screen.getByText('Выберите дату для просмотра или создания события.')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Пароль/)).not.toBeInTheDocument();
  });

  it('вход админом: бейдж роли и админ-панель вместо календаря', async () => {
    const user = userEvent.setup();
    const sessionApi = createInMemorySessionApi(null);
    const login = vi.spyOn(sessionApi, 'login');
    await renderApp(createInMemoryMeetingsApi(), sessionApi);

    await user.type(screen.getByLabelText(/^Пароль/), 'admin');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    // Переключатель «Я гость» выключен — имя в запрос не попадает.
    expect(login).toHaveBeenCalledWith({ password: 'admin' });
    expect(await screen.findByText('Админ')).toBeInTheDocument();
    expect(screen.getByText('Админ-панель')).toBeInTheDocument();
    // Админ не записывается на встречи (Q12c) — календаря он не видит.
    expect(
      screen.queryByText('Выберите дату для просмотра или создания события.')
    ).not.toBeInTheDocument();
  });

  it('неверный пароль: ошибка над формой, форма остаётся', async () => {
    const user = userEvent.setup();
    await renderApp(createInMemoryMeetingsApi(), createInMemorySessionApi(null));

    await user.type(screen.getByLabelText(/^Пароль/), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось войти. Проверьте пароль и попробуйте ещё раз.'
    );
    expect(screen.getByLabelText(/^Пароль/)).toBeInTheDocument();
    expect(
      screen.queryByText('Выберите дату для просмотра или создания события.')
    ).not.toBeInTheDocument();
  });

  it('после выхода снова экран входа, а пароль очищен', async () => {
    const user = userEvent.setup();
    await renderApp(createInMemoryMeetingsApi(), createInMemorySessionApi(null));

    await user.click(screen.getByLabelText('Я гость'));
    await user.type(screen.getByLabelText(/^Ваше имя/), 'Иван');
    await user.type(screen.getByLabelText(/^Пароль/), 'guest');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    await screen.findByText('Гость');

    await user.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(await screen.findByRole('button', { name: 'Войти' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Пароль/)).toHaveValue('');
    expect(screen.queryByLabelText(/^Ваше имя/)).not.toBeInTheDocument();
    expect(screen.queryByText('Гость')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Выберите дату для просмотра или создания события.')
    ).not.toBeInTheDocument();
  });

  it('ошибка выхода показывается над видом, сессия не теряется', async () => {
    const user = userEvent.setup();
    const sessionApi: SessionApi = {
      ...guestSession(),
      logout: () => Promise.reject(new Error('нет связи')),
    };
    await renderApp(createInMemoryMeetingsApi(), sessionApi);

    await user.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось выйти. Попробуйте ещё раз.'
    );
    expect(screen.getByText('Гость')).toBeInTheDocument();
    expect(
      screen.getByText('Выберите дату для просмотра или создания события.')
    ).toBeInTheDocument();
  });

  it('пока GET /api/me не ответил — восстановление, ни формы, ни календаря', async () => {
    const sessionApi: SessionApi = {
      login: () => pending<Session>(),
      logout: () => pending<void>(),
      me: () => pending<Session | null>(),
    };

    render(
      <MantineProvider defaultColorScheme="dark">
        <DatesProvider settings={DATES_SETTINGS}>
          <App sessionApi={sessionApi} />
        </DatesProvider>
      </MantineProvider>
    );

    expect(screen.getByText('Восстановление сессии…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Войти' })).not.toBeInTheDocument();
    expect(
      screen.queryByText('Выберите дату для просмотра или создания события.')
    ).not.toBeInTheDocument();
  });
});