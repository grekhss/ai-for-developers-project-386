import { useState } from 'react';
import { Container, Title, Text, Card } from '@mantine/core';
import { DatePicker, useDatesContext } from '@mantine/dates';
import dayjs from 'dayjs';

export default function App() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { locale } = useDatesContext();

  return (
    <Container size="sm" py="xl">
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Title order={2} mb="md">Календарь встреч</Title>
        <Text size="sm" c="dimmed" mb="lg">
          Выберите дату для просмотра или создания события.
        </Text>

        <DatePicker
          type="default"
          value={selectedDate}
          onChange={setSelectedDate}
        />

        {selectedDate && (
          <Text mt="md" c="blue">
            Выбранная дата: {dayjs(selectedDate).locale(locale).format('D MMMM YYYY')}
          </Text>
        )}
      </Card>
    </Container>
  );
}
