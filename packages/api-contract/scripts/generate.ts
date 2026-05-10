import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const generatedDir = path.resolve(__dirname, '../src/generated');

if (!existsSync(generatedDir)) {
  mkdirSync(generatedDir, { recursive: true });
}

const apiBaseUrl = process.env.API_URL || 'http://localhost:8080';
const specUrl = `${apiBaseUrl}/api/openapi.json`;

console.log(`Fetching OpenAPI spec from ${specUrl}...`);

try {
  execSync(
    `npx openapi-typescript "${specUrl}" -o "${path.join(generatedDir, 'openapi.d.ts')}"`,
    { stdio: 'inherit' },
  );
  console.log('Types generated successfully!');
} catch (error) {
  console.error('Failed to generate types. Is the API server running?');
  process.exit(1);
}
