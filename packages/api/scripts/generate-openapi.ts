import { writeFileSync } from 'node:fs';
import { createApp } from '../src/index.js';

const app = createApp();

// Fetch the OpenAPI spec from the app
const spec = app.getOpenAPI31Document({
  openapi: '3.1.0',
  info: {
    title: 'Harpa API',
    version: '1.0.0',
    description: 'REST API for Harpa construction reporting platform',
  },
  servers: [{ url: 'http://localhost:8080', description: 'Local dev' }],
});

const outPath = new URL('../openapi.json', import.meta.url).pathname;
writeFileSync(outPath, JSON.stringify(spec, null, 2) + '\n');
console.log(`OpenAPI spec written to ${outPath}`);
