import express from 'express';
import { now, today } from './date.js';
import {
  isAllowedTime,
  isPastDay,
  isSlotAlreadyStarted,
  isWeekendDay,
  windowEnd,
} from './booking-rules.js';
import { DuplicateMeetingError } from './repository.js';
import { requireRole } from './role.js';
import { isValidDraft, isValidMeetingTypeDraft, isValidRange } from './validate.js';
import type { AppRepositories } from './app.js';

export interface RoutesDependencies extends AppRepositories {}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Роуты API. Роли — из cookie `role` (см. server/role.ts); сессий нет.
 * Доменные правила букинга и целостность — в этом слое (S5/C1).
 */
export function createRoutes(repos: RoutesDependencies) {
  const router = express.Router();
  const { meetings, meetingTypes } = repos;

  // Доступ к записям: открыт для ролей по cookie.
  router.get('/meetings', (req, res) => {
    if (!isValidRange(req.query)) {
      res.status(400).json({ error: 'параметры запроса from и to обязательны в формате YYYY-MM-DD' });
      return;
    }
    const { from, to } = req.query as { from: string; to: string };
    const list = meetings.list(from, to);
    res.json({ meetings: list });
  });

  router.post('/meetings', (req, res) => {
    if (!isObject(req.body)) {
      res.status(400).json({ error: 'тело запроса должно быть JSON-объектом' });
      return;
    }
    if (!isValidDraft(req.body)) {
      res.status(400).json({
        error: 'date и time обязательны, формат time HH:mm; booker_name — непустая строка до 100 символов без одних пробелов; meeting_type_id — строка, если передан',
      });
      return;
    }

    const moment = now();
    if (isPastDay(req.body.date, moment)) {
      res.status(400).json({ error: 'дата прошла' });
      return;
    }
    if (isWeekendDay(req.body.date)) {
      res.status(400).json({ error: 'выходной день — запись только на будни' });
      return;
    }
    if (req.body.date > windowEnd(moment)) {
      res.status(400).json({ error: 'дата вне окна записи (14 дней)' });
      return;
    }
    if (!isAllowedTime(req.body.time)) {
      res.status(400).json({ error: 'время вне сетки рабочего дня (09:00–18:00, шаг 30 минут)' });
      return;
    }
    if (isSlotAlreadyStarted(req.body.date, req.body.time, moment)) {
      res.status(400).json({ error: 'время уже прошло' });
      return;
    }

    const meetingTypeId = req.body.meeting_type_id;
    if (meetingTypeId !== undefined) {
      if (typeof meetingTypeId !== 'string') {
        res.status(400).json({ error: 'meeting_type_id — строка, если передан' });
        return;
      }
      const all = meetingTypes.listAll();
      const meetingType = all.find((m) => m.id === meetingTypeId);
      if (!meetingType || !meetingType.active) {
        res.status(400).json({ error: 'тип встречи не найден или неактивен' });
        return;
      }
    }

    const booker = req.body.booker_name.trim();
    if (booker === '') {
      res.status(400).json({ error: 'имя записавшегося обязательно' });
      return;
    }
    if (booker.length > 100) {
      res.status(400).json({ error: 'имя записавшегося длиннее 100 символов' });
      return;
    }

    try {
      const created = meetings.create(
        {
          date: req.body.date,
          time: req.body.time,
          meeting_type_id: meetingTypeId,
          booker_name: booker,
        },
        booker,
      );
      res.status(201).json({ meeting: created });
    } catch (error) {
      if (error instanceof DuplicateMeetingError) {
        res.status(409).json({ error: 'этот слот уже занят' });
        return;
      }
      throw error;
    }
  });

  // Типы встреч
  router.get('/meeting-types', (_req, res) => {
    const types = meetingTypes.listActive();
    res.json({ meetingTypes: types });
  });

  router.post('/meeting-types', requireRole('admin'), (req, res) => {
    if (!isObject(req.body)) {
      res.status(400).json({ error: 'тело запроса должно быть JSON-объектом' });
      return;
    }
    if (!isValidMeetingTypeDraft(req.body)) {
      res.status(400).json({
        error: 'name — непустая строка с минимум одним непробельным символом; description — строка; duration_minutes — целое 30–180',
      });
      return;
    }
    const duration = Number(req.body.duration_minutes);
    if (!Number.isInteger(duration) || duration < 30 || duration > 180 || duration % 30 !== 0) {
      res.status(400).json({ error: 'duration_minutes — кратно 30, от 30 до 180 минут' });
      return;
    }
    const name = String(req.body.name).trim();
    if (name === '') {
      res.status(400).json({ error: 'name — непустая строка с минимум одним непробельным символом' });
      return;
    }
    const created = meetingTypes.create({
      name,
      description: String(req.body.description ?? ''),
      duration_minutes: duration,
    });
    res.status(201).json({ meetingType: created });
  });

  router.post('/meeting-types/:id/deactivate', requireRole('admin'), (req, res) => {
    const id = String(req.params.id ?? '');
    if (!/^\d+$/.test(id)) {
      res.status(400).json({ error: 'id должен быть числом' });
      return;
    }
    const meetingType = meetingTypes.deactivate(id);
    if (!meetingType) {
      res.status(400).json({ error: 'тип встречи не найден' });
      return;
    }
    res.json({ meetingType });
  });

  // Админский список запланированных встреч
  router.get('/admin/meetings', requireRole('admin'), (_req, res) => {
    const meetingsList = meetings.listPlanned(today());
    res.json({ meetings: meetingsList });
  });

  return router;
}
