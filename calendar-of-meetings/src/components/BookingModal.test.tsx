import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import BookingModal from './BookingModal.tsx';

const DATE = '2026-10-05';

function renderModal(overrides: Partial<Parameters<typeof BookingModal>[0]> = {}) {
  const props = {
    date: DATE,
    takenTimes: [] as string[],
    time: null as string | null,
    onChangeTime: vi.fn(),
    onBook: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };

  // Mantine v9 бросает ошибку без MantineProvider в дереве.
  const view = render(
    <MantineProvider defaultColorScheme="dark">
      <BookingModal {...props} />
    </MantineProvider>
  );

  return { ...view, props };
}

function slotButtons(): HTMLElement[] {
  return screen
    .getAllByRole('button')
    .filter((button) => /^\d{2}:\d{2}$/.test(button.textContent ?? ''));
}

describe('BookingModal', () => {
  it('показывает выбранный день по-русски и подсказку', () => {
    renderModal();

    expect(screen.getByText('5 октября 2026')).toBeInTheDocument();
    expect(screen.getByText('Выберите время для встречи')).toBeInTheDocument();
  });

  it('не рендерится, если день не выбран', () => {
    renderModal({ date: null });

    expect(screen.queryByText('Выберите время для встречи')).not.toBeInTheDocument();
  });

  it('показывает слоты рабочего дня', () => {
    renderModal();

    const slots = slotButtons();

    expect(slots).toHaveLength(18);
    expect(slots[0]).toHaveTextContent('09:00');
    expect(slots.at(-1)).toHaveTextContent('17:30');
  });

  it('выключает уже занятые слоты', () => {
    renderModal({ takenTimes: ['11:00'] });

    expect(screen.getByRole('button', { name: '11:00' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '12:00' })).toBeEnabled();
  });

  it('отдаёт выбранный слот наружу', async () => {
    const user = userEvent.setup();
    const { props } = renderModal();

    await user.click(screen.getByRole('button', { name: '11:00' }));

    expect(props.onChangeTime).toHaveBeenCalledWith('11:00');
  });

  it('не даёт записаться без выбранного слота', () => {
    renderModal();

    expect(screen.getByRole('button', { name: 'Записаться' })).toBeDisabled();
  });

  it('записывает день и выбранный слот', async () => {
    const user = userEvent.setup();
    const { props } = renderModal({ time: '11:00' });

    const bookButton = screen.getByRole('button', { name: 'Записаться' });
    expect(bookButton).toBeEnabled();

    await user.click(bookButton);

    expect(props.onBook).toHaveBeenCalledWith({ date: DATE, time: '11:00' });
  });

  it('закрывается по кнопке «Отмена»', async () => {
    const user = userEvent.setup();
    const { props } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(props.onClose).toHaveBeenCalled();
  });
});