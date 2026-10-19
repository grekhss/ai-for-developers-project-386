import { useState } from 'react';
import { Alert, Badge, Button, Card, Container, Group, Text, Title } from '@mantine/core';
import LoginScreen from './components/LoginScreen.tsx';
import GuestView from './GuestView.tsx';
import { useSession } from './hooks/useSession.ts';
import { sessionApi as defaultSessionApi, type SessionApi } from './lib/session/api.ts';
import { meetingsApi, type MeetingsApi } from './lib/meetings/api.ts';
import { meetingTypesApi, type MeetingTypesApi } from './lib/meeting-types/api.ts';
import type { LoginInput } from './lib/session/types.ts';

interface AppProps {
  /** Подменяется в тестах, чтобы не делить записи между сценариями. */
  api?: MeetingsApi;
  /** Типы встреч для гостевого вида — тот же шов (F7). */
  typesApi?: MeetingTypesApi;
  /** И сессия тоже через проп: тесты входа подставляют свой фейк (T6). */
  sessionApi?: SessionApi;
}

/**
 * Страница целиком за паролем (Q12a): пока `GET /api/me` не ответил —
 * восстановление, без сессии — экран входа, дальше — вид по роли, которую
 * решил сервер (Q9). Шапка с бейджем роли и «Выйти» — по D4 (вариант A).
 */
export default function App({
  api = meetingsApi,
  typesApi = meetingTypesApi,
  sessionApi = defaultSessionApi,
}: AppProps) {
  const { session, loading, error, login, logout } = useSession(sessionApi);
  // Форма входа — UI-состояние страницы (как selectedDate раньше в App):
  // значения живут, пока форма показана, и очищаются после успешного входа,
  // чтобы пароль не дожидался пользователя на выходе.
  const [password, setPassword] = useState('');
  const [bookerName, setBookerName] = useState('');
  const [guest, setGuest] = useState(false);

  async function handleLogin(input: LoginInput) {
    const signedIn = await login(input);
    if (signedIn !== null) {
      setPassword('');
      setBookerName('');
      setGuest(false);
    }
  }

  if (loading) {
    return (
      <Container size="sm" py="xl">
        <Text c="dimmed">Восстановление сессии…</Text>
      </Container>
    );
  }

  if (session === null) {
    return (
      <LoginScreen
        error={error}
        password={password}
        bookerName={bookerName}
        guest={guest}
        onPasswordChange={setPassword}
        onBookerNameChange={setBookerName}
        onGuestChange={setGuest}
        onSubmit={handleLogin}
      />
    );
  }

  const isAdmin = session.role === 'admin';

  return (
    <Container size="sm" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={2}>Календарь встреч</Title>
        <Group gap="xs">
          {/* Бейдж лишь показывает ответ сервера: роль выбрал пароль (Q9). */}
          <Badge color={isAdmin ? 'blue' : 'gray'}>{isAdmin ? 'Админ' : 'Гость'}</Badge>
          <Button variant="light" size="sm" onClick={() => { void logout(); }}>
            Выйти
          </Button>
        </Group>
      </Group>

      {error !== null && (
        <Alert color="red" mb="md">{error}</Alert>
      )}

      {isAdmin ? (
        // Админ не записывается на встречи (Q12c); содержимое панели — F6.
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Text fw={500}>Админ-панель</Text>
          <Text size="sm" c="dimmed">
            Разделы «Типы встреч» и «Запланированные встречи» готовятся.
          </Text>
        </Card>
      ) : (
        <GuestView api={api} typesApi={typesApi} />
      )}
    </Container>
  );
}
