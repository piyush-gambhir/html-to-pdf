# document-html-pdf

Sidecar HTTP service: **HTML in → PDF out** (headless Chromium), in the same spirit as **[document-ocr](https://github.com/piyush-gambhir/document-ocr)** — a small **Docker** image the LagyaVisa monorepo talks to over HTTP. No business logic; callers send full HTML (inline CSS recommended).

## Layout (mirrors `document-ocr`)

| Path | Purpose |
|------|---------|
| `core/pdf.ts` | Chromium resolution + `renderHtmlToPdf()` |
| `deploy/docker/http.ts` | HTTP routes (like `document-ocr/deploy/docker/server.py`) |
| `deploy/docker/index.ts` | Process entry |
| `deploy/docker/Dockerfile` | Production image |
| `tests/typescript/` | Vitest smoke tests |

## API

- `GET /health` — `{ "status": "ok", "service": "document-html-pdf" }`
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

## Docker (from repo root)

```bash
pnpm install && pnpm run build
docker build -f deploy/docker/Dockerfile -t document-html-pdf:local .
docker run --rm -p 8010:8010 -e PORT=8010 document-html-pdf:local
```

## LagyaVisa monorepo

When you run `pnpm dev` from **lagyavisa** with the backend, if this repo exists as a **sibling folder** (`../document-html-pdf`), `scripts/dev/dev-all.sh` will:

1. Build `document-html-pdf:local` if missing  
2. Run container **`document-html-pdf`** on host port **8010** (same idea as `document-ocr` on **8000**)

Point your API at `http://127.0.0.1:8010` when you wire HTTP PDF rendering (e.g. `HTML_TO_PDF_URL`).

## License

MIT — see `LICENSE`.
