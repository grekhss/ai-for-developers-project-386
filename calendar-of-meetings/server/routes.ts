import express from 'express';
import { DuplicateBookingError, type BookingsRepository } from './repository.js';
import { isValidDraft, isValidRange } from './validate.js';

/** Роуты API броней. Фабрика: принимает репозиторий, чтобы тесты подавали ':memory:'. */
export function createRoutes(repo: BookingsRepository): express.Router {
  const router = express.Router();

  router.get('/api/bookings', (req, res) => {
    const query = req.query as Record<string, unknown>;
    if (!isValidRange(query)) {
      // Без этой проверки better-sqlite3 упал бы с 500 «too few parameter values».
      res.status(400).json({ error: 'from и to обязательны, формат YYYY-MM-DD' });
      return;
    }
    res.json(repo.list(query.from, query.to));
  });

  router.post('/api/bookings', (req, res) => {
    if (!isValidDraft(req.body)) {
      res.status(400).json({ error: 'date и time обязательны, формат time HH:mm' });
      return;
    }

    try {
      res.status(201).json(repo.create(req.body));
    } catch (error) {
      if (error instanceof DuplicateBookingError) {
        res.status(409).json({ error: 'слот уже занят' });
        return;
      }
      // Прочие ошибки отдаёт стандартный обработчик Express — 500.
      throw error;
    }
  });

  return router;
}