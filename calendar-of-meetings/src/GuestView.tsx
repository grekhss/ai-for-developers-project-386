import { useState } from 'react';
import { Alert, Button, Radio, Stack, Stepper, Text, TextInput } from '@mantine/core';
import MeetingCalendar from './components/MeetingCalendar.tsx';
import TimeSlots from './components/TimeSlots.tsx';
import { useMeetings } from './hooks/useMeetings.ts';
import { useMeetingTypes } from './hooks/useMeetingTypes.ts';
import { meetingsApi, type MeetingsApi } from './lib/meetings/api.ts';
import { meetingTypesApi, type MeetingTypesApi } from './lib/meeting-types/api.ts';
import type { MeetingType } from './lib/meeting-types/types.ts';
import { formatDateRu } from './lib/date.ts';
import { formatDurationRu } from './lib/duration.ts';

/**
 * Подпись типа в списке: описание и длительность.
 */
function typeOptionDescription(type: MeetingType): string {
  const duration = formatDurationRu(type.duration_minutes);
  return type.description === '' ? duration : `${type.description} · ${duration}`;
}

interface GuestViewProps {
  api?: MeetingsApi;
  typesApi?: MeetingTypesApi;
}

/** Сводка успешной записи для Alert'а. */
interface BookedSummary {
  typeName: string;
  date: string;
  time: string;
}

/**
 * Гостевое представление (F7): Stepper «Тип → Время → Готово» по D4.
 * Имя записавшегося вводится на шаге «Готово» и передаётся в `booker_name`.
 */
export default function GuestView({ api = meetingsApi, typesApi = meetingTypesApi }: GuestViewProps) {
  const [step, setStep] = useState(0);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [bookerName, setBookerName] = useState('');
  const [lastBooked, setLastBooked] = useState<BookedSummary | null>(null);
  const { meetings, loading, error, createMeeting } = useMeetings(api);
  const { meetingTypes, loading: typesLoading, error: typesError } = useMeetingTypes(typesApi);

  const selectedType = meetingTypes.find((type) => type.id === typeId) ?? null;
  const takenTimes = meetings
    .filter((meeting) => meeting.date === selectedDate)
    .map((meeting) => meeting.time);
  const readyToConfirm =
    selectedType !== null && selectedDate !== null && time !== null && bookerName.trim() !== '';

  function selectType(id: string) {
    setLastBooked(null);
    setTypeId(id);
  }

  function selectDate(date: string) {
    setLastBooked(null);
    setTime(null);
    setSelectedDate(date);
  }

  function selectTime(nextTime: string | null) {
    setLastBooked(null);
    setTime(nextTime);
  }

  async function handleBook() {
    if (selectedType === null || selectedDate === null || time === null) return;
    if (bookerName.trim() === '') return;

    const created = await createMeeting({
      date: selectedDate,
      time,
      meeting_type_id: selectedType.id,
      booker_name: bookerName.trim(),
    });
    if (created !== null) {
      setLastBooked({ typeName: selectedType.name, date: selectedDate, time });
    }
  }

  return (
    <>
      {lastBooked !== null && (
        <Alert color="blue" mb="md">
          Запись: {lastBooked.typeName}, {formatDateRu(lastBooked.date)}, {lastBooked.time}
        </Alert>
      )}

      {(error !== null || typesError !== null) && (
        <Alert color="red" mb="md">{error ?? typesError}</Alert>
      )}

      {typesLoading ? (
        <Text c="dimmed">Загрузка типов встреч…</Text>
      ) : meetingTypes.length === 0 ? (
        // Активных типов нет — записываться не на что (D4: пустые состояния — тексты).
        <Text c="dimmed">Запись сейчас недоступна</Text>
      ) : (
        // Назад — только на пройденные шаги: allowNextStepsSelect выключен,
        // иначе гость прыгнул бы на «Готово» без даты и времени.
        <Stepper active={step} onStepClick={setStep} allowNextStepsSelect={false}>
          <Stepper.Step label="Тип">
            <Radio.Group value={typeId} onChange={selectType} label="Тип встречи">
              <Stack mt="xs">
                {meetingTypes.map((type) => (
                  <Radio
                    key={type.id}
                    value={type.id}
                    label={type.name}
                    description={typeOptionDescription(type)}
                  />
                ))}
              </Stack>
            </Radio.Group>

            <Button mt="md" disabled={selectedType === null} onClick={() => setStep(1)}>
              Далее
            </Button>
          </Stepper.Step>

          <Stepper.Step label="Время">
            <MeetingCalendar value={selectedDate} onSelect={selectDate} />

            {selectedDate === null ? (
              <Text mt="md" c="dimmed">Выберите дату, чтобы посмотреть свободные слоты.</Text>
            ) : loading ? (
              <Text mt="md" c="dimmed">Загрузка записей…</Text>
            ) : (
              <TimeSlots takenTimes={takenTimes} time={time} onChangeTime={selectTime} />
            )}

            <Button
              mt="md"
              disabled={selectedDate === null || time === null}
              onClick={() => setStep(2)}
            >
              Далее
            </Button>
          </Stepper.Step>

          <Stepper.Step label="Готово">
            {readyToConfirm && (
              <>
                <Text>Тип: {selectedType.name}</Text>
                <Text>Длительность: {formatDurationRu(selectedType.duration_minutes)}</Text>
                <Text>Дата: {formatDateRu(selectedDate)}</Text>
                <Text>Время: {time}</Text>
              </>
            )}
            <TextInput
              label="Ваше имя"
              placeholder="Как к вам обращаться"
              value={bookerName}
              onChange={(event) => { setLastBooked(null); setBookerName(event.currentTarget.value); }}
              mt="md"
              required
            />

            <Button mt="md" disabled={!readyToConfirm} onClick={() => { void handleBook(); }}>
              Записаться
            </Button>
          </Stepper.Step>
        </Stepper>
      )}
    </>
  );
}
