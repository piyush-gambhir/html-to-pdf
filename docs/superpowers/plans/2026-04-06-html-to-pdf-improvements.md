# document-html-pdf Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add proper project scaffolding (.gitignore, .dockerignore, prettier), comprehensive tests, CI/CD workflows, optimize the Dockerfile, initialize git, push to GitHub as a public repo, and publish the first Docker image.

**Architecture:** Standalone Node.js microservice with raw `node:http`, puppeteer-core for Chromium PDF rendering. Tests mock `renderHtmlToPdf` for HTTP-layer tests and use real Chromium for integration tests. CI runs unit/HTTP tests without Chromium, integration tests inside Docker.

**Tech Stack:** Node 22, TypeScript, puppeteer-core, Vitest, Prettier, GitHub Actions, Docker Hub

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `.gitignore` | Create | Ignore node_modules, dist, .env |
| `.dockerignore` | Create | Keep Docker context small |
| `.prettierrc` | Create | Formatting config (match monorepo style) |
| `.prettierignore` | Create | Exclude dist, lockfile |
| `package.json` | Modify | Add `format:check` script |
| `deploy/docker/Dockerfile` | Modify | Optimize: drop pnpm from runner, copy node_modules |
| `tests/typescript/core.test.ts` | Rename from `health.test.ts` | Existing unit test |
| `tests/typescript/http.test.ts` | Create | HTTP layer tests |
| `tests/typescript/integration.test.ts` | Create | End-to-end PDF rendering test |
| `.github/workflows/test.yml` | Create | CI: lint, typecheck, test on PR |
| `.github/workflows/publish.yml` | Create | CD: publish Docker image on tag |

---

### Task 1: Project scaffolding (.gitignore, .dockerignore, prettier)

**Files:**
- Create: `.gitignore`
- Create: `.dockerignore`
- Create: `.prettierrc`
- Create: `.prettierignore`
- Modify: `package.json`

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
dist/
.env
*.tsbuildinfo
```

- [ ] **Step 2: Create `.dockerignore`**

```
node_modules
dist
.git
.github
tests
docs
.env*
.gitignore
.prettierrc
.prettierignore
README.md
LICENSE
vitest.config.ts
```

- [ ] **Step 3: Create `.prettierrc`**

```json
{
  "printWidth": 100,
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "all"
}
```

- [ ] **Step 4: Create `.prettierignore`**

```
dist
node_modules
pnpm-lock.yaml
```

- [ ] **Step 5: Add `format:check` script to `package.json`**

Add to scripts:
```json
"format:check": "prettier --check \"core/**/*.ts\" \"deploy/docker/**/*.ts\" \"tests/**/*.ts\""
```

- [ ] **Step 6: Run formatter and verify**

Run: `pnpm run format`
Run: `pnpm run format:check`
Expected: All files pass (exit 0)

- [ ] **Step 7: Commit**

```bash
git add .gitignore .dockerignore .prettierrc .prettierignore package.json
git commit -m "chore: add gitignore, dockerignore, prettier config"
```

---

### Task 2: Optimize Dockerfile

**Files:**
- Modify: `deploy/docker/Dockerfile`

- [ ] **Step 1: Rewrite `deploy/docker/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY core ./core
COPY deploy/docker ./deploy/docker
RUN pnpm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8010 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
  && addgroup -g 1001 nodejs \
  && adduser -u 1001 -G nodejs -D nodejs

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER nodejs
EXPOSE 8010
CMD ["node", "dist/deploy/docker/index.js"]
```

Key changes from current:
- Syntax directive on line 1 (BuildKit parses it)
- Runner no longer installs corepack/pnpm or runs `pnpm install --prod`
- Single `COPY --from=build` for node_modules

- [ ] **Step 2: Verify Docker build works**

Run: `docker build -f deploy/docker/Dockerfile -t document-html-pdf:test .`
Expected: Build succeeds

- [ ] **Step 3: Verify container starts**

Run: `docker run --rm -d --name dhp-test -p 8010:8010 document-html-pdf:test`
Run: `curl -s http://localhost:8010/health`
Expected: `{"status":"ok","service":"document-html-pdf"}`
Run: `docker stop dhp-test`

- [ ] **Step 4: Commit**

```bash
git add deploy/docker/Dockerfile
git commit -m "perf: optimize Dockerfile — drop pnpm from runner stage"
```

---

### Task 3: Rename existing test + write HTTP tests

**Files:**
- Rename: `tests/typescript/health.test.ts` → `tests/typescript/core.test.ts`
- Create: `tests/typescript/http.test.ts`

- [ ] **Step 1: Rename existing test file**

```bash
mv tests/typescript/health.test.ts tests/typescript/core.test.ts
```

Verify contents still work:
Run: `pnpm test -- tests/typescript/core.test.ts`
Expected: PASS

- [ ] **Step 2: Write HTTP tests — `tests/typescript/http.test.ts`**

```typescript
import { type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHttpServer } from '../../deploy/docker/http.js';

// Mock renderHtmlToPdf so tests don't need Chromium
vi.mock('../../core/pdf.js', () => ({
  resolveChromiumPath: () => '/usr/bin/chromium',
  renderHtmlToPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 fake')),
}));

const TEST_PORT = 18010;

async function request(
  path: string,
  opts: { method?: string; body?: string; headers?: Record<string, string> } = {},
) {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}${path}`, {
    method: opts.method ?? 'GET',
    body: opts.body,
    headers: opts.headers,
  });
  return res;
}

describe('HTTP server (no auth)', () => {
  let server: Server;

  beforeAll(async () => {
    server = await createHttpServer({ port: TEST_PORT, apiToken: null });
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('GET /health returns 200', async () => {
    const res = await request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok', service: 'document-html-pdf' });
  });

  it('GET / returns 200 (alias for health)', async () => {
    const res = await request('/');
    expect(res.status).toBe(200);
  });

  it('GET /ready returns 200 when chromium found', async () => {
    const res = await request('/ready');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ready' });
  });

  it('GET /unknown returns 404', async () => {
    const res = await request('/unknown');
    expect(res.status).toBe(404);
  });

  it('POST /v1/render with non-JSON body returns 400', async () => {
    const res = await request('/v1/render', {
      method: 'POST',
      body: 'not json',
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('bad_request');
  });

  it('POST /v1/render with missing html field returns 400', async () => {
    const res = await request('/v1/render', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('bad_request');
  });

  it('POST /v1/render with empty html returns 400', async () => {
    const res = await request('/v1/render', {
      method: 'POST',
      body: JSON.stringify({ html: '' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  it('POST /v1/render with valid html returns 200 + PDF', async () => {
    const res = await request('/v1/render', {
      method: 'POST',
      body: JSON.stringify({ html: '<h1>Hello</h1>' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.toString('utf8')).toContain('%PDF');
  });
});

describe('HTTP server (with auth)', () => {
  let server: Server;
  const TOKEN = 'test-secret-token';
  const AUTH_PORT = 18011;

  beforeAll(async () => {
    server = await createHttpServer({ port: AUTH_PORT, apiToken: TOKEN });
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  function authRequest(
    path: string,
    opts: { method?: string; body?: string; headers?: Record<string, string> } = {},
  ) {
    return fetch(`http://127.0.0.1:${AUTH_PORT}${path}`, {
      method: opts.method ?? 'GET',
      body: opts.body,
      headers: opts.headers,
    });
  }

  it('POST /v1/render without token returns 401', async () => {
    const res = await authRequest('/v1/render', {
      method: 'POST',
      body: JSON.stringify({ html: '<h1>Hi</h1>' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });

  it('POST /v1/render with wrong token returns 401', async () => {
    const res = await authRequest('/v1/render', {
      method: 'POST',
      body: JSON.stringify({ html: '<h1>Hi</h1>' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' },
    });
    expect(res.status).toBe(401);
  });

  it('POST /v1/render with correct token returns 200', async () => {
    const res = await authRequest('/v1/render', {
      method: 'POST',
      body: JSON.stringify({ html: '<h1>Hi</h1>' }),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
  });

  it('health endpoint does not require auth', async () => {
    const res = await authRequest('/health');
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: All tests pass (core + http)

- [ ] **Step 4: Commit**

```bash
git add tests/typescript/
git commit -m "test: add comprehensive HTTP layer tests"
```

---

### Task 4: Write integration test

**Files:**
- Create: `tests/typescript/integration.test.ts`

- [ ] **Step 1: Write `tests/typescript/integration.test.ts`**

```typescript
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
```

- [ ] **Step 2: Run tests locally**

Run: `pnpm test`
Expected: integration tests skipped if no Chromium, unit+HTTP tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/typescript/integration.test.ts
git commit -m "test: add integration test for real Chromium PDF rendering"
```

---

### Task 5: GitHub Actions — test workflow

**Files:**
- Create: `.github/workflows/test.yml`

- [ ] **Step 1: Create `.github/workflows/test.yml`**

```yaml
name: Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm run build

      - name: Format check
        run: pnpm run format:check

      - name: Unit + HTTP tests
        run: pnpm test

  integration:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4

      - name: Build Docker image
        run: docker build -f deploy/docker/Dockerfile -t document-html-pdf:ci .

      - name: Run integration tests in container
        run: |
          docker run --rm document-html-pdf:ci sh -c "
            cd /app &&
            node -e \"
              const http = require('http');
              const { renderHtmlToPdf } = require('./dist/core/pdf.js');

              async function main() {
                const pdf = await renderHtmlToPdf('<h1>CI Test</h1>');
                if (!pdf.subarray(0, 5).toString('ascii').startsWith('%PDF-')) {
                  console.error('FAIL: not a valid PDF');
                  process.exit(1);
                }
                if (pdf.length < 100) {
                  console.error('FAIL: PDF too small:', pdf.length);
                  process.exit(1);
                }
                console.log('PASS: PDF rendered,', pdf.length, 'bytes');
              }

              main().catch(e => { console.error(e); process.exit(1); });
            \"
          "
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: add test workflow (typecheck, format, unit, integration)"
```

---

### Task 6: GitHub Actions — publish workflow

**Files:**
- Create: `.github/workflows/publish.yml`

- [ ] **Step 1: Create `.github/workflows/publish.yml`**

```yaml
name: Publish

on:
  push:
    tags:
      - 'v*'

jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          file: deploy/docker/Dockerfile
          push: true
          tags: |
            piyushgambhir/document-html-pdf:${{ github.ref_name }}
            piyushgambhir/document-html-pdf:latest
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/publish.yml
git commit -m "ci: add Docker Hub publish workflow on tag push"
```

---

### Task 7: Git init, push to GitHub, tag v0.1.0

**Files:** None (git operations only)

- [ ] **Step 1: Initialize git repo**

```bash
cd /Users/piyushgambhir/code/personal/document-html-pdf
git init -b main
git add -A
git commit -m "feat: initial commit — HTML to PDF microservice"
```

Note: This step is done FIRST, before tasks 1-6. Tasks 1-6 commit on top of this. Execution order: Task 7 Step 1 → Tasks 1-6 → Task 7 Steps 2-4.

- [ ] **Step 2: Create public GitHub repo and push**

```bash
gh repo create piyush-gambhir/document-html-pdf --public --source=. --push
```

- [ ] **Step 3: Tag v0.1.0 and push tag**

```bash
git tag v0.1.0
git push origin v0.1.0
```

This triggers the publish workflow. Note: `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets must be set on the repo first, otherwise the publish job will fail.

- [ ] **Step 4: Set Docker Hub secrets on the repo**

```bash
gh secret set DOCKERHUB_USERNAME
gh secret set DOCKERHUB_TOKEN
```

(These prompt for the value interactively.)

---

## Execution Order

Because the repo has no git yet, the actual execution sequence is:

1. **Task 7 Step 1** — git init + initial commit
2. **Task 1** — scaffolding (.gitignore, .dockerignore, prettier)
3. **Task 2** — Dockerfile optimization
4. **Task 3** — HTTP tests
5. **Task 4** — Integration test
6. **Task 5** — Test workflow
7. **Task 6** — Publish workflow
8. **Task 7 Steps 2-4** — Push to GitHub, set secrets, tag
