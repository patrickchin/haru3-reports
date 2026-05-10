import { serve } from '@hono/node-server';
import { createApp } from './index.js';

const app = createApp();
const port = Number(process.env.PORT) || 8080;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API running on http://localhost:${info.port}`);
});
