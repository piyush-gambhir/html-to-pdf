# document-html-pdf: Structure Improvements + CI/CD

**Date:** 2026-04-06
**Status:** Approved

## Context

`html-to-pdf` is a standalone HTML → PDF microservice (headless Chromium / puppeteer-core). The codebase works but is missing CI, proper tests, Docker optimizations, and isn't in version control yet.

## Goals

1. Optimize the Docker image (smaller, faster builds)
2. Add comprehensive test coverage (unit, HTTP, integration)
3. Add GitHub Actions CI/CD (test on PR, publish to Docker Hub on tag)
4. Initialize git repo and push to GitHub as a public repository
5. Tag and publish first Docker image to Docker Hub

## What stays the same

The core structure is clean and doesn't need restructuring:
- `core/pdf.ts` — Chromium resolution + `renderHtmlToPdf()`
- `deploy/docker/http.ts` — HTTP routes
- `deploy/docker/index.ts` — Process entry point
- `deploy/docker/Dockerfile` — Production image

## Changes

### 1. Add `.gitignore` + `.dockerignore` + Prettier config

**.gitignore:** `node_modules`, `dist`, `.env`, typical Node artifacts.

**.dockerignore:** `node_modules`, `dist`, `.git`, `tests`, `docs`, `.env*` — keep Docker context small.

**`.prettierrc`:** Consistent formatting config. The `format` script already exists in `package.json`.

**`.prettierignore`:** `dist`, `node_modules`, `pnpm-lock.yaml`.

### 2. Slim down Dockerfile

Current issues:
- Syntax directive is in a comment (not parsed by BuildKit)
- Runner stage installs `corepack` + `pnpm` + runs `pnpm install --prod` unnecessarily
- Only runtime dep is `puppeteer-core` — can just copy `node_modules` from build stage

Changes:
- Move `# syntax=docker/dockerfile:1.7` to actual first line (no `#` prefix needed — it IS a comment but must be line 1)
- Remove `corepack`/`pnpm` from runner stage
- `COPY --from=build /app/node_modules ./node_modules` instead of reinstalling
- Result: fewer layers, faster builds, smaller image

### 3. Comprehensive tests

**Unit tests** (`tests/typescript/core.test.ts`):
- `resolveChromiumPath` returns null or string (existing, keep)

**HTTP tests** (`tests/typescript/http.test.ts`):
- Spin up server via `createHttpServer`
- `GET /health` → 200 + correct JSON
- `GET /ready` → 200 or 503 depending on Chromium
- `POST /v1/render` with missing body → 400
- `POST /v1/render` with non-JSON body → 400
- `POST /v1/render` with empty html → 400
- `POST /v1/render` with valid html → 200 + PDF bytes (mock `renderHtmlToPdf`)
- Auth: when `apiToken` set, missing/wrong token → 401, correct token → 200
- `GET /unknown` → 404

**Integration test** (`tests/typescript/integration.test.ts`):
- Real Chromium end-to-end: send simple HTML, get PDF back
- Verify response starts with `%PDF-`
- Verify reasonable byte length (> 100 bytes)
- Skip if no Chromium binary available (CI unit job won't have it)
- Runs in the Docker-based CI job where Chromium is installed

### 4. GitHub Actions

**`.github/workflows/test.yml`** — on pull_request to `main`:
- Job 1 (`test`): setup Node 22, `pnpm install`, `pnpm run build` (typecheck), `pnpm run format:check` (prettier), `pnpm test` (unit + HTTP tests, no Chromium needed)
- Job 2 (`integration`): build Docker image, run integration tests inside the container

**`.github/workflows/publish.yml`** — on push tag `v*`:
- Login to Docker Hub using `DOCKERHUB_USERNAME` + `DOCKERHUB_TOKEN` secrets
- Build and push `piyushgambhir/document-html-pdf:<tag>` + `:latest`

### 5. Git init + push

- `git init`, initial commit with all files
- Create public repo `piyush-gambhir/document-html-pdf` on GitHub via `gh`
- Push to `main`
- Tag `v0.1.0` and push tag (triggers first Docker Hub publish)

## Docker Hub secrets required

User must add these secrets to the GitHub repo settings:
- `DOCKERHUB_USERNAME` — Docker Hub username
- `DOCKERHUB_TOKEN` — Docker Hub access token

## Image naming

- `docker.io/piyushgambhir/document-html-pdf:v0.1.0`
- `docker.io/piyushgambhir/document-html-pdf:latest`
