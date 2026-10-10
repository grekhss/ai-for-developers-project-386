import { Button, Group, Modal, Text } from '@mantine/core';
import { TimeGrid } from '@mantine/dates';
import type { BookingDraft } from '../lib/bookings/types.ts';
import { formatDateRu } from '../lib/date.ts';
import { generateTimeSlots } from '../lib/slots.ts';

/** Слоты рабочего дня не зависят от состояния, поэтому считаются один раз. */
const SLOTS = generateTimeSlots();

interface BookingModalProps {
  /** День, для которого выбирается слот; `null` — окно закрыто. */
  date: string | null;
  /** Слоты этого дня, уже занятые другими записями, 'HH:mm'. */
  takenTimes: string[];
  /** Выбранный слот, 'HH:mm'. */
  time: string | null;
  onChangeTime: (time: string | null) => void;
  onBook: (draft: BookingDraft) => void;
  onClose: () => void;
}

/** Собирает запись только если выбраны и день, и слот. */
function toDraft(date: string | null, time: string | null): BookingDraft | null {
  return date !== null && time !== null ? { date, time } : null;
}

/**
 * Выбор времени встречи. Выбранный слот держит родитель, а не модалка: так его
 * можно сбросить в обработчике клика по дате, и не нужен remount по `key` ради
 * сброса состояния.
 */
export default function BookingModal({
  date,
  takenTimes,
  time,
  onChangeTime,
  onBook,
  onClose,
}: BookingModalProps) {
  const draft = toDraft(date, time);

  return (
    <Modal
      opened={date !== null}
      onClose={onClose}
      title={date === null ? null : formatDateRu(date)}
      size="sm"
      centered
    >
      <Text size="sm" c="dimmed" mb="sm">
        Выберите время для встречи
      </Text>

      <TimeGrid data={SLOTS} value={time} onChange={onChangeTime} disableTime={takenTimes} />

      <Group justify="flex-end" mt="md">
        <Button variant="subtle" color="gray" onClick={onClose}>
          Отмена
        </Button>
        <Button
          disabled={draft === null}
          onClick={() => {
            if (draft !== null) onBook(draft);
          }}
        >
          Записаться
        </Button>
      </Group>
    </Modal>
  );
}