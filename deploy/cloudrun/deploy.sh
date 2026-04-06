#!/usr/bin/env bash
set -euo pipefail

# ── Deploy html-to-pdf to GCP Cloud Run ─────────────────────────────────────
#
# Usage:
#   ./deploy/cloudrun/deploy.sh                # deploy latest
#   ./deploy/cloudrun/deploy.sh --from-hub     # use existing Docker Hub image instead of Cloud Build
#
# Prerequisites (one-time):
#   gcloud auth login
#   gcloud config set project "${GCP_PROJECT_ID}"
#   gcloud services enable run.googleapis.com artifactregistry.googleapis.com
#
#   # Create Artifact Registry repo (if not already created for lagyavisa)
#   gcloud artifacts repositories create lagyavisa \
#     --repository-format=docker --location="${GCP_REGION}" --description="Docker images"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${ROOT_DIR}"

GCP_PROJECT_ID="${GCP_PROJECT_ID:-projects-454107}"
GCP_REGION="${GCP_REGION:-asia-south1}"
SERVICE_NAME="html-to-pdf"
REPO="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/lagyavisa/${SERVICE_NAME}"
TAG="${REPO}:$(git rev-parse --short HEAD)"

FROM_HUB=0
for arg in "$@"; do
  case "${arg}" in
    --from-hub) FROM_HUB=1 ;;
  esac
done

# ── Build ────────────────────────────────────────────────────────────────────
if [[ "${FROM_HUB}" -eq 1 ]]; then
  echo "[deploy] Using Docker Hub image piyushgambhir/html-to-pdf:latest"
  # Pull from Docker Hub, retag for Artifact Registry, push
  docker pull piyushgambhir/html-to-pdf:latest
  docker tag piyushgambhir/html-to-pdf:latest "${TAG}"
  docker push "${TAG}"
else
  echo "[deploy] Building via Cloud Build..."
  gcloud builds submit \
    --tag="${TAG}" \
    --project="${GCP_PROJECT_ID}" \
    --timeout=600s \
    --gcs-log-dir="gs://${GCP_PROJECT_ID}_cloudbuild/logs" \
    .
fi

# ── Deploy ───────────────────────────────────────────────────────────────────
echo "[deploy] Deploying ${SERVICE_NAME} to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image="${TAG}" \
  --region="${GCP_REGION}" \
  --platform=managed \
  --port=8010 \
  --memory=1Gi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --timeout=60s \
  --concurrency=10 \
  --allow-unauthenticated \
  --project="${GCP_PROJECT_ID}"

# Set API_TOKEN via:
#   gcloud run services update html-to-pdf --region="${GCP_REGION}" \
#     --set-env-vars="API_TOKEN=your-secret" --project="${GCP_PROJECT_ID}"
# Or use Secret Manager:
#   --set-secrets="API_TOKEN=html-to-pdf-token:latest"

# ── Smoke check ──────────────────────────────────────────────────────────────
SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" \
  --region="${GCP_REGION}" --format='value(status.url)' --project="${GCP_PROJECT_ID}")"

echo "[deploy] Smoke check: GET ${SERVICE_URL}/health ..."
HTTP_STATUS="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "${SERVICE_URL}/health" || true)"

if [[ "${HTTP_STATUS}" == "200" ]]; then
  echo "[deploy] Smoke check passed (HTTP ${HTTP_STATUS})."
else
  echo "[deploy] WARNING: Smoke check returned HTTP ${HTTP_STATUS}." >&2
fi

echo "[deploy] Done. URL: ${SERVICE_URL}"
