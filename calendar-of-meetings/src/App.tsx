import { useState } from 'react';
import { Container, Title, Text, Card } from '@mantine/core';
import BookingModal from './components/BookingModal.tsx';
import MeetingCalendar from './components/MeetingCalendar.tsx';
import { useBookings } from './hooks/useBookings.ts';
import { bookingsApi, type BookingsApi } from './lib/bookings/api.ts';
import type { BookingDraft } from './lib/bookings/types.ts';
import { formatDateRu } from './lib/date.ts';

interface AppProps {
  /** Подменяется в тестах, чтобы не делить записи между сценариями. */
  api?: BookingsApi;
}

export default function App({ api = bookingsApi }: AppProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [lastBooked, setLastBooked] = useState<BookingDraft | null>(null);
  const { bookings, loading, error, createBooking } = useBookings(api);

  const takenTimes = bookings
    .filter((booking) => booking.date === selectedDate)
    .map((booking) => booking.time);

  function closeModal() {
    setSelectedDate(null);
    setTime(null);
  }

  function handleBook(draft: BookingDraft) {
    void createBooking(draft);
    setLastBooked(draft);
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

      <BookingModal
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