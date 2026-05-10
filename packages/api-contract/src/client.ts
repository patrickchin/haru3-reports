import createClient from 'openapi-fetch';
// import type { paths } from './generated/openapi.js';

// Placeholder until types are generated
type paths = Record<string, any>;

export function createApiClient(
  baseUrl: string,
  getToken: () => Promise<string | null>,
) {
  const client = createClient<paths>({
    baseUrl,
  });

  // Add auth middleware
  client.use({
    async onRequest({ request }) {
      const token = await getToken();
      if (token) {
        request.headers.set('Authorization', `Bearer ${token}`);
      }
      return request;
    },
  });

  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
