import { useState } from 'react';
import { Container, Title, Text, Card } from '@mantine/core';
import MeetingModal from './components/MeetingModal.tsx';
import MeetingCalendar from './components/MeetingCalendar.tsx';
import { useMeetings } from './hooks/useMeetings.ts';
import { meetingsApi, type MeetingsApi } from './lib/meetings/api.ts';
import type { MeetingDraft } from './lib/meetings/types.ts';
import { formatDateRu } from './lib/date.ts';

interface AppProps {
  /** Подменяется в тестах, чтобы не делить записи между сценариями. */
  api?: MeetingsApi;
}

export default function App({ api = meetingsApi }: AppProps) {
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
    <Container size="sm" py="xl">
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Title order={2} mb="md">Календарь встреч</Title>
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
    </Container>
  );
}