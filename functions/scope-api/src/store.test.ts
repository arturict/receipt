import assert from 'node:assert/strict';
import { AppwriteException } from 'node-appwrite';
import { describe, it } from 'vitest';
import { budgetRetryDelayMs, budgetRowId, budgetWindows, isCounterLimit } from './store.js';

describe('AI budget keys', () => {
  it('uses stable UTC hour and month windows', () => {
    assert.deepEqual(budgetWindows(new Date('2026-07-20T23:45:12.000Z')), {
      hour: '2026-07-20T23',
      month: '2026-07',
    });
  });

  it('creates bounded deterministic and scope-separated row IDs', () => {
    const first = budgetRowId('user_hour', 'user-1:2026-07-20T23');
    assert.equal(first.length, 32);
    assert.match(first, /^[a-f0-9]+$/);
    assert.equal(first, budgetRowId('user_hour', 'user-1:2026-07-20T23'));
    assert.notEqual(first, budgetRowId('project_month', 'user-1:2026-07-20T23'));
  });

  it('recognizes both live and documented Appwrite max-counter errors', () => {
    assert.equal(isCounterLimit(new AppwriteException('max', 400, 'column_limit_exceeded')), true);
    assert.equal(isCounterLimit(new AppwriteException('max', 400, 'column_value_invalid')), true);
    assert.equal(isCounterLimit(new AppwriteException('other', 409, 'column_value_invalid')), false);
  });

  it('backs off boundedly when concurrent budget transactions conflict', () => {
    assert.equal(budgetRetryDelayMs(0, 0), 75);
    assert.equal(budgetRetryDelayMs(3, 0), 600);
    assert.equal(budgetRetryDelayMs(8, 0), 800);
    assert.equal(budgetRetryDelayMs(0, 0.99), 149);
  });
});
