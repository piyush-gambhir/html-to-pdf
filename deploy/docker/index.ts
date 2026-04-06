import { createHttpServer } from './http.js';

const port = Number(process.env.PORT ?? '8010') || 8010;
const apiToken = process.env.API_TOKEN?.trim() || null;

await createHttpServer({ port, apiToken });

const authHint = apiToken
  ? 'Bearer token required on POST /v1/render.'
  : 'No API_TOKEN — open render endpoint (use only on private networks).';

// eslint-disable-next-line no-console
console.log(`document-html-pdf listening on :${port}. ${authHint}`);
