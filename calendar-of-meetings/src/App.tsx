import { useState } from 'react';
import { Container, Title, Text, Card } from '@mantine/core';
import { Calendar } from '@mantine/dates';

export default function App() {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  return (
    <Container size="sm" py="xl">
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Title order={2} mb="md">Календарь встреч</Title>
        <Text size="sm" c="dimmed" mb="lg">
          Выберите дату для просмотра или создания события.
        </Text>

        <Calendar 
          value={selectedDate} 
          onChange={setSelectedDate} 
        />

        {selectedDate && (
          <Text mt="md" c="blue">
            Выбранная дата: {selectedDate.toLocaleDateString()}
          </Text>
        )}
      </Card>
    </Container>
  );
}
