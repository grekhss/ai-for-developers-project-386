import { useState } from 'react';
import { Card, Text } from '@mantine/core';
import MeetingModal from './components/MeetingModal.tsx';
import MeetingCalendar from './components/MeetingCalendar.tsx';
import { useMeetings } from './hooks/useMeetings.ts';
import { meetingsApi, type MeetingsApi } from './lib/meetings/api.ts';
import type { MeetingDraft } from './lib/meetings/types.ts';
import { formatDateRu } from './lib/date.ts';

interface GuestViewProps {
  /** Подменяется в тестах, чтобы не делить записи между сценариями. */
  api?: MeetingsApi;
}

/**
 * Гостевой вид: календарь + выбор слота в модалке — страница букинга, ждущая
 * шага «тип» из F7. Состояние страницы (дата, слот, последняя запись) и
 * `useMeetings` живут здесь, а не в App: вид монтируется только после входа,
 * иначе список записей ушёл бы на сервер без сессии (401, Q12a).
 */
export default function GuestView({ api = meetingsApi }: GuestViewProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [lastBooked, setLastBooked] = useState<MeetingDraft | null>(null);
  const { meetings, loading, error, createMeeting } = useMeetings(api);

  const takenTimes = meetings
    .filter((meeting) => meeting.date === selectedDate)
    .map((meeting) => meeting.time);

  function closeModal() {
    setSelectedDate(null);
    setTime(null);
  }

  async function handleBook(draft: MeetingDraft) {
    const created = await createMeeting(draft);
    // Строка «Запись: …» — только при успехе: иначе при ошибке создания
    // под календарём висели бы и красная ошибка, и синяя запись.
    if (created !== null) setLastBooked(draft);
    // Окно закрываем в любом случае — ошибка рендерится под модалкой.
    closeModal();
  }

  return (
    <>
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Text size="sm" c="dimmed" mb="lg">
          Выберите дату для просмотра или создания события.
        </Text>

        <MeetingCalendar
          value={selectedDate}
          onSelect={(date) => {
            setLastBooked(null);
            setTime(null);
            setSelectedDate(date);
          }}
        />

        {error !== null && (
          <Text mt="md" c="red">{error}</Text>
        )}

        {loading && (
          <Text mt="md" c="dimmed">Загрузка записей…</Text>
        )}

        {!loading && error === null && lastBooked === null && (
          <Text mt="md" c="dimmed">Выберите дату, чтобы посмотреть свободные слоты.</Text>
        )}

        {lastBooked !== null && (
          <Text mt="md" c="blue">
            Запись: {formatDateRu(lastBooked.date)}, {lastBooked.time}
          </Text>
        )}
      </Card>

      <MeetingModal
        date={selectedDate}
        takenTimes={takenTimes}
        time={time}
        onChangeTime={setTime}
        onBook={handleBook}
        onClose={closeModal}
      />
    </>
  );
}
