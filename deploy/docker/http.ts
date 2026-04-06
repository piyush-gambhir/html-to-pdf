import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { renderHtmlToPdf, resolveChromiumPath, type RenderPdfOptions } from '../../core/pdf.js';

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export interface RenderRequestBody {
  html: string;
  options?: RenderPdfOptions;
}

function unauthorized(res: ServerResponse) {
  json(res, 401, {
    error: 'unauthorized',
    message: 'Invalid or missing Authorization bearer token.',
  });
}

/**
 * HTTP server for HTML → PDF (mirrors document-ocr’s deploy/docker/server.py role).
 */
export function createHttpServer(opts: { apiToken: string | null; port: number }): Promise<Server> {
  const server = createServer(async (req, res) => {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    if (method === 'GET' && (url === '/' || url === '/health')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'document-html-pdf' }));
      return;
    }

    if (method === 'GET' && url === '/ready') {
      const chromium = resolveChromiumPath();
      if (!chromium) {
        json(res, 503, {
          status: 'not_ready',
          message: 'Chromium binary not found (set PUPPETEER_EXECUTABLE_PATH).',
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ready' }));
      return;
    }

    if (method === 'POST' && url === '/v1/render') {
      if (opts.apiToken) {
        const auth = req.headers.authorization?.trim();
        const expected = `Bearer ${opts.apiToken}`;
        if (auth !== expected) {
          unauthorized(res);
          return;
        }
      }

      let raw: string;
      try {
        raw = await readBody(req);
      } catch {
        json(res, 400, { error: 'bad_request', message: 'Could not read body.' });
        return;
      }

      let body: RenderRequestBody;
      try {
        body = JSON.parse(raw) as RenderRequestBody;
      } catch {
        json(res, 400, { error: 'bad_request', message: 'Body must be JSON.' });
        return;
      }

      if (typeof body.html !== 'string' || body.html.length === 0) {
        json(res, 400, {
          error: 'bad_request',
          message: 'Field "html" is required and must be a non-empty string.',
        });
        return;
      }

      try {
        const pdf = await renderHtmlToPdf(body.html, body.options ?? {});
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Length': pdf.length,
          'Cache-Control': 'no-store',
        });
        res.end(pdf);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'render_failed';
        json(res, 500, { error: 'render_failed', message });
      }
      return;
    }

    json(res, 404, { error: 'not_found' });
  });

  return new Promise<Server>((resolve, reject) => {
    server.listen(opts.port, () => resolve(server));
    server.on('error', reject);
  });
}
