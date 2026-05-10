import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { errorHandler } from './middleware/error.js';
import { health } from './routes/health.js';
import { profiles } from './routes/profiles.js';
import { projects } from './routes/projects.js';
import { reports } from './routes/reports.js';
import { reportNotes } from './routes/report-notes.js';
import { files } from './routes/files.js';
import { ai } from './routes/ai.js';
import { auth } from './routes/auth.js';

export function createApp() {
  const app = new OpenAPIHono();

  app.use('*', cors());
  app.onError(errorHandler);

  // OpenAPI security scheme
  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });

  // Mount route modules
  app.route('/', health);
  app.route('/', auth);
  app.route('/', profiles);
  app.route('/', projects);
  app.route('/', reports);
  app.route('/', reportNotes);
  app.route('/', files);
  app.route('/', ai);

  // OpenAPI JSON endpoint
  app.doc('/api/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Harpa API',
      version: '1.0.0',
      description: 'REST API for Harpa construction reporting platform',
    },
    servers: [{ url: 'http://localhost:8080', description: 'Local dev' }],
  });

  return app;
}
