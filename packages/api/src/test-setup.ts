import { beforeEach } from 'vitest';
import { _resetRateLimitStore } from './middleware/rate-limit.js';

beforeEach(() => {
  _resetRateLimitStore();
});
