import { describe, it, expect } from 'vitest';
import { roleForPath } from './role.ts';

describe('roleForPath', () => {
  it('/admin и вложенные пути — админ, всё остальное — гость', () => {
    expect(roleForPath('/admin')).toBe('admin');
    expect(roleForPath('/admin/meetings')).toBe('admin');
    expect(roleForPath('/')).toBe('guest');
    expect(roleForPath('/guest')).toBe('guest');
    // Граница: /administrator — не /admin, это по-прежнему гость.
    expect(roleForPath('/administrator')).toBe('guest');
  });
});
