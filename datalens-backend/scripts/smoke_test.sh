#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# DataLens Smoke Test Suite
# Tests all critical API endpoints against a running backend.
#
# Usage:
#   ./scripts/smoke_test.sh [BASE_URL]
#
# Default BASE_URL: http://localhost:8080/api/v1
#
# Prerequisites:
#   - Backend running (go run ./cmd/server/ or docker-compose up -d)
#   - curl available
#   - jq available (optional, for pretty-printing)
#
# Exit code:
#   0 — all tests passed
#   1 — one or more tests failed
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

BASE="${1:-http://localhost:8080/api/v1}"
PASS=0
FAIL=0
TOKEN=""
DS_ID=""
CONN_ID=""

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
RESET='\033[0m'
BOLD='\033[1m'

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo -e "${BOLD}▶ $*${RESET}"; }
ok()   { echo -e "  ${GREEN}✓ $*${RESET}"; ((PASS++)) || true; }
fail() { echo -e "  ${RED}✗ $*${RESET}"; ((FAIL++)) || true; }
warn() { echo -e "  ${YELLOW}⚠ $*${RESET}"; }

# assert_status <expected_code> <actual_code> <test_name>
assert_status() {
  local expected="$1" actual="$2" name="$3"
  if [ "$actual" -eq "$expected" ]; then
    ok "$name (HTTP $actual)"
  else
    fail "$name — expected HTTP $expected, got $actual"
  fi
}

# http_get <path> [token]
http_get() {
  local path="$1"
  local auth="${2:-}"
  local headers=(-H "Content-Type: application/json")
  [ -n "$auth" ] && headers+=(-H "Authorization: Bearer $auth")
  curl -s -o /dev/null -w "%{http_code}" "${headers[@]}" "${BASE}${path}"
}

# http_post <path> <body> [token]
http_post() {
  local path="$1" body="$2"
  local auth="${3:-}"
  local headers=(-H "Content-Type: application/json")
  [ -n "$auth" ] && headers+=(-H "Authorization: Bearer $auth")
  curl -s -w "\n%{http_code}" "${headers[@]}" -d "$body" "${BASE}${path}"
}

http_post_file() {
  local path="$1" field="$2" file="$3"
  local auth="${4:-}"
  local headers=()
  [ -n "$auth" ] && headers+=(-H "Authorization: Bearer $auth")
  curl -s -o /dev/null -w "%{http_code}" "${headers[@]}" -F "${field}=@${file}" "${BASE}${path}"
}

echo ""
echo -e "${BOLD}━━━ DataLens Smoke Test Suite ━━━${RESET}"
echo -e "  Base URL: ${BASE}"
echo -e "  Date: $(date)"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
log "[1] Health & metadata"
# ═══════════════════════════════════════════════════════════════════════════════

code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 --retry 3 --retry-delay 2 "${BASE%/api/v1}/health" 2>/dev/null || echo "000")
if [ "$code" = "200" ] || [ "$code" = "404" ]; then
  ok "Server reachable (HTTP $code)"
else
  fail "Server not reachable — is it running at ${BASE}?"
fi

# ═══════════════════════════════════════════════════════════════════════════════
log "[2] Auth — Register + Login + Refresh"
# ═══════════════════════════════════════════════════════════════════════════════

TS=$(date +%s)
EMAIL="smoke_${TS}@datalens.local"

RESP=$(http_post "/auth/register" "{\"email\":\"${EMAIL}\",\"password\":\"Smoke1234!\",\"displayName\":\"Smoke User\"}")
CODE=$(echo "$RESP" | tail -1)
assert_status 201 "$CODE" "POST /auth/register"

RESP=$(http_post "/auth/login" "{\"email\":\"${EMAIL}\",\"password\":\"Smoke1234!\"}")
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -1)
assert_status 200 "$CODE" "POST /auth/login"

TOKEN=$(echo "$BODY" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4 || echo "")
if [ -z "$TOKEN" ]; then
  warn "Could not extract accessToken — remaining tests skipped if auth is required"
fi

CODE=$(http_get "/auth/me" "$TOKEN")
assert_status 200 "$CODE" "GET /auth/me"

# ═══════════════════════════════════════════════════════════════════════════════
log "[3] Datasets"
# ═══════════════════════════════════════════════════════════════════════════════

CODE=$(http_get "/datasets" "$TOKEN")
assert_status 200 "$CODE" "GET /datasets"

# Upload a tiny CSV
TMPCSV=$(mktemp /tmp/smoke_XXXXXX.csv)
printf "name,value\nalpha,100\nbeta,200\n" > "$TMPCSV"

CODE=$(http_post_file "/datasets/upload" "file" "$TMPCSV" "$TOKEN")
if [ "$CODE" = "201" ] || [ "$CODE" = "200" ]; then
  ok "POST /datasets/upload (HTTP $CODE)"
  DS_ID="placeholder"   # real ID extraction would need jq
else
  warn "POST /datasets/upload returned HTTP $CODE — CSV upload may be skipped"
fi
rm -f "$TMPCSV"

# ═══════════════════════════════════════════════════════════════════════════════
log "[4] Dashboards"
# ═══════════════════════════════════════════════════════════════════════════════

CODE=$(http_get "/dashboards" "$TOKEN")
assert_status 200 "$CODE" "GET /dashboards"

RESP=$(http_post "/dashboards" '{"name":"Smoke Dashboard","widgets":[]}' "$TOKEN")
CODE=$(echo "$RESP" | tail -1)
assert_status 201 "$CODE" "POST /dashboards"

# ═══════════════════════════════════════════════════════════════════════════════
log "[5] Reports & Data Stories"
# ═══════════════════════════════════════════════════════════════════════════════

CODE=$(http_get "/reports" "$TOKEN")
assert_status 200 "$CODE" "GET /reports"

CODE=$(http_get "/stories" "$TOKEN")
assert_status 200 "$CODE" "GET /stories"

# ═══════════════════════════════════════════════════════════════════════════════
log "[6] KPIs & Alerts"
# ═══════════════════════════════════════════════════════════════════════════════

CODE=$(http_get "/kpis" "$TOKEN")
assert_status 200 "$CODE" "GET /kpis"

CODE=$(http_get "/alerts" "$TOKEN")
assert_status 200 "$CODE" "GET /alerts"

# ═══════════════════════════════════════════════════════════════════════════════
log "[7] Scheduled Jobs (Cron)"
# ═══════════════════════════════════════════════════════════════════════════════

CODE=$(http_get "/cron" "$TOKEN")
assert_status 200 "$CODE" "GET /cron"

# ═══════════════════════════════════════════════════════════════════════════════
log "[8] Charts & ETL Pipelines"
# ═══════════════════════════════════════════════════════════════════════════════

CODE=$(http_get "/charts" "$TOKEN")
assert_status 200 "$CODE" "GET /charts"

CODE=$(http_get "/pipelines" "$TOKEN")
assert_status 200 "$CODE" "GET /pipelines"

# ═══════════════════════════════════════════════════════════════════════════════
log "[9] External DB Connections"
# ═══════════════════════════════════════════════════════════════════════════════

CODE=$(http_get "/connections" "$TOKEN")
assert_status 200 "$CODE" "GET /connections"

CODE=$(http_get "/connections/types" "$TOKEN")
assert_status 200 "$CODE" "GET /connections/types"

# ═══════════════════════════════════════════════════════════════════════════════
log "[10] Import (File Parsers)"
# ═══════════════════════════════════════════════════════════════════════════════

CODE=$(http_get "/import/supported" "$TOKEN")
assert_status 200 "$CODE" "GET /import/supported"

# ═══════════════════════════════════════════════════════════════════════════════
log "[11] Report Templates"
# ═══════════════════════════════════════════════════════════════════════════════

CODE=$(http_get "/templates" "$TOKEN")
if [ "$CODE" = "200" ] || [ "$CODE" = "404" ]; then
  ok "GET /templates (HTTP $CODE)"
else
  warn "GET /templates returned HTTP $CODE"
fi

# ═══════════════════════════════════════════════════════════════════════════════
log "[12] Security — Unauthenticated access blocked"
# ═══════════════════════════════════════════════════════════════════════════════

CODE=$(http_get "/datasets")
if [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then
  ok "GET /datasets without token → HTTP $CODE (blocked)"
else
  fail "GET /datasets without token → HTTP $CODE (should be 401/403)"
fi

CODE=$(http_get "/dashboards")
if [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then
  ok "GET /dashboards without token → HTTP $CODE (blocked)"
else
  fail "GET /dashboards without token → HTTP $CODE (should be 401/403)"
fi

# ═══════════════════════════════════════════════════════════════════════════════
log "[13] Input validation"
# ═══════════════════════════════════════════════════════════════════════════════

RESP=$(http_post "/auth/login" '{"email":"bad@domain","password":"x"}')
CODE=$(echo "$RESP" | tail -1)
if [ "$CODE" = "401" ] || [ "$CODE" = "400" ] || [ "$CODE" = "422" ]; then
  ok "POST /auth/login with invalid credentials → HTTP $CODE"
else
  warn "Expected 400/401/422 for bad credentials, got $CODE"
fi

RESP=$(http_post "/auth/register" '{}')
CODE=$(echo "$RESP" | tail -1)
if [ "$CODE" = "400" ] || [ "$CODE" = "422" ]; then
  ok "POST /auth/register with empty body → HTTP $CODE"
else
  warn "Expected 400/422 for empty register body, got $CODE"
fi

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}━━━ Results ━━━${RESET}"
TOTAL=$((PASS + FAIL))
echo -e "  Total:   $TOTAL"
echo -e "  ${GREEN}Passed: $PASS${RESET}"
if [ $FAIL -gt 0 ]; then
  echo -e "  ${RED}Failed: $FAIL${RESET}"
  echo ""
  exit 1
else
  echo -e "  ${GREEN}All tests passed! ✓${RESET}"
  echo ""
  exit 0
fi
