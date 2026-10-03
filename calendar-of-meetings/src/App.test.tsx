import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import dayjs from 'dayjs';
import App from './App.tsx';

function renderApp() {
  return render(
    <MantineProvider defaultColorScheme="dark">
      <DatesProvider settings={{ locale: 'ru' }}>
        <App />
      </DatesProvider>
    </MantineProvider>
  );
}

describe('App', () => {
  it('показывает заголовок и подсказку', () => {
    renderApp();

    expect(screen.getByText('Календарь встреч')).toBeInTheDocument();
    expect(
      screen.getByText('Выберите дату для просмотра или создания события.')
    ).toBeInTheDocument();
  });

  it('выбирает дату по клику и показывает её по-русски', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();

    expect(screen.queryByText(/^Выбранная дата:/)).not.toBeInTheDocument();

    const today = container.querySelector<HTMLButtonElement>('[data-today]');
    expect(today).not.toBeNull();
    await user.click(today as HTMLButtonElement);

    expect(container.querySelector('[data-selected]')).not.toBeNull();
    expect(screen.getByText(/^Выбранная дата:/)).toHaveTextContent(
      `Выбранная дата: ${dayjs().locale('ru').format('D MMMM YYYY')}`
    );
  });

  it('рендерит календарь в русской локали', () => {
    renderApp();

    expect(screen.getByText(dayjs().locale('ru').format('MMMM YYYY'))).toBeInTheDocument();
  });
});