import { type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveChromiumPath } from '../../core/pdf.js';
import { createHttpServer } from '../../deploy/docker/http.js';

const chromium = resolveChromiumPath();
const INTEG_PORT = 18012;

describe.skipIf(!chromium)('integration: real Chromium PDF render', () => {
  let server: Server;

  beforeAll(async () => {
    server = await createHttpServer({ port: INTEG_PORT, apiToken: null });
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('renders simple HTML to valid PDF', async () => {
    const res = await fetch(`http://127.0.0.1:${INTEG_PORT}/v1/render`, {
      method: 'POST',
      body: JSON.stringify({
        html: '<!DOCTYPE html><html><body><h1>Integration Test</h1><p>Hello world</p></body></html>',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');

    const buf = Buffer.from(await res.arrayBuffer());
    // PDF magic bytes
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    // Reasonable size for a simple page
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.length).toBeLessThan(500_000);
  });

  it('renders HTML with inline CSS', async () => {
    const res = await fetch(`http://127.0.0.1:${INTEG_PORT}/v1/render`, {
      method: 'POST',
      body: JSON.stringify({
        html: '<!DOCTYPE html><html><head><style>body { background: red; }</style></head><body><h1>Styled</h1></body></html>',
        options: { format: 'A4', printBackground: true },
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
