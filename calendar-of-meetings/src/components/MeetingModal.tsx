import { Button, Group, Modal, Text } from '@mantine/core';
import { TimeGrid } from '@mantine/dates';
import type { MeetingDraft } from '../lib/meetings/types.ts';
import { formatDateRu } from '../lib/date.ts';
import { generateTimeSlots } from '../lib/slots.ts';

/** Слоты рабочего дня не зависят от состояния, поэтому считаются один раз. */
const SLOTS = generateTimeSlots();

interface MeetingModalProps {
  /** День, для которого выбирается слот; `null` — окно закрыто. */
  date: string | null;
  /** Слоты этого дня, уже занятые другими записями, 'HH:mm'. */
  takenTimes: string[];
  /** Выбранный слот, 'HH:mm'. */
  time: string | null;
  onChangeTime: (time: string | null) => void;
  onBook: (draft: MeetingDraft) => void;
  onClose: () => void;
}

/** Собирает запись только если выбраны и день, и слот. */
function toDraft(date: string | null, time: string | null): MeetingDraft | null {
  return date !== null && time !== null ? { date, time } : null;
}

/**
 * Выбор времени встречи. Выбранный слот держит родитель, а не модалка: так его
 * можно сбросить в обработчике клика по дате, и не нужен remount по `key` ради
 * сброса состояния.
 */
export default function MeetingModal({
  date,
  takenTimes,
  time,
  onChangeTime,
  onBook,
  onClose,
}: MeetingModalProps) {
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