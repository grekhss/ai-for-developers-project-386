import { DatePicker } from '@mantine/dates';
import { isBookable } from '../lib/date.ts';

interface MeetingCalendarProps {
  /** Выбранный день в формате DateStringValue, 'YYYY-MM-DD'. */
  value: string | null;
  /** Вызывается с днём, выбранным пользователем. */
  onSelect: (date: string) => void;
}

/**
 * Правило «в какие дни можно записаться» живёт в lib/date.ts, здесь только
 * переворачиваем его под конвенцию excludeDate.
 */
const notBookable = (date: string): boolean => !isBookable(date);

/**
 * Единственный компонент, который знает про `@mantine/dates`. Наружу отдаёт
 * только строки 'YYYY-MM-DD', поэтому остальной код приложения не зависит от
 * версии Mantine и от того, как она устроена внутри.
 */
export default function MeetingCalendar({ value, onSelect }: MeetingCalendarProps) {
  return (
    <DatePicker
      type="default"
      value={value}
      onChange={(date) => {
        // Тип onChange допускает null (allowDeselect), а выключенные дни
        // недоступны для клика и null не присылают — сужаем явно.
        if (date !== null) onSelect(date);
      }}
      excludeDate={notBookable}
    />
  );
}