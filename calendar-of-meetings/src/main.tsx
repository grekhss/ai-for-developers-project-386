import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { APP_LOCALE } from './lib/date.ts'
import { roleForPath } from './lib/role.ts'
import '@mantine/core/styles.css'
import '@mantine/dates/styles.css'
import { MantineProvider } from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import 'dayjs/locale/ru'

document.cookie = `role=${roleForPath(window.location.pathname)}; path=/; SameSite=Lax`

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider defaultColorScheme="dark">
      <DatesProvider settings={{ locale: APP_LOCALE }}>
        <App />
      </DatesProvider>
    </MantineProvider>
  </React.StrictMode>,
)
