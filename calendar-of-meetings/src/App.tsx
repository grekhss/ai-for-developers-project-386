import { Container, Group, Title, Badge, Anchor, Alert } from '@mantine/core';
import { useState } from 'react';
import AdminView from './AdminView.tsx';
import GuestView from './GuestView.tsx';
import { roleForPath } from './lib/role.ts';

export default function App() {
  const isAdmin = roleForPath(window.location.pathname) === 'admin';
  const key = 'calendar-role-hint-seen';
  const [showPathHint, setShowPathHint] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (window.localStorage.getItem(key)) return false;
    if (isAdmin) return false;
    window.localStorage.setItem(key, '1');
    return true;
  });

  return (
    <Container size="md" py="xl">
      <Group justify="space-between" mb="lg">
        <Group gap="sm">
          <Title order={1}>Календарь встреч</Title>
          <Badge color={isAdmin ? 'blue' : 'gray'}>
            {isAdmin ? 'Админ' : 'Гость'}
          </Badge>
        </Group>
        <Anchor href={isAdmin ? '/' : '/admin'}>
          {isAdmin ? 'К гостевому виду' : 'Открыть панель администратора'}
        </Anchor>
      </Group>
      {showPathHint && !isAdmin ? (
        <Alert color="blue" variant="light" mb="md" withCloseButton onClose={() => setShowPathHint(false)}>
          Панель администратора доступна по адресу <strong>/admin</strong>
        </Alert>
      ) : null}
      {isAdmin ? <AdminView /> : <GuestView />}
    </Container>
  );
}
