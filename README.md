# html-to-pdf

Standalone HTTP microservice: **HTML in → PDF out** via headless Chromium. Send any HTML (inline CSS recommended), get a PDF back. No business logic — just rendering.

## Layout

| Path | Purpose |
|------|---------|
| `core/pdf.ts` | Chromium resolution + `renderHtmlToPdf()` |
| `deploy/docker/http.ts` | HTTP routes |
| `deploy/docker/index.ts` | Process entry |
| `deploy/docker/Dockerfile` | Production image |
| `tests/typescript/` | Vitest tests |

## API

- `GET /health` — `{ "status": "ok", "service": "html-to-pdf" }`
- `GET /ready` — `{ "status": "ready" }` or `503` if Chromium is missing
- `POST /v1/render` — JSON `{ "html": "<!DOCTYPE html>...", "options": { ... } }` → `application/pdf`

Optional: set `API_TOKEN`; then require `Authorization: Bearer <token>` on `/v1/render`.

## Local dev

```bash
pnpm install
cp .env.example .env
# Point PUPPETEER_EXECUTABLE_PATH at Chrome/Chromium on your machine
pnpm dev
```

## Docker

```bash
docker build -f deploy/docker/Dockerfile -t html-to-pdf:local .
docker run --rm -p 8010:8010 html-to-pdf:local
```

## Docker Hub

```bash
docker pull piyushgambhir/html-to-pdf:latest
docker run --rm -p 8010:8010 piyushgambhir/html-to-pdf:latest
```

## License

MIT — see `LICENSE`.
