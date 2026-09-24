#!/usr/bin/env sh
set -eu

: "${API_HEALTH_URL:?API_HEALTH_URL is required}"
: "${AI_GATEWAY_HEALTH_URL:?AI_GATEWAY_HEALTH_URL is required}"
curl --fail --silent --show-error "$API_HEALTH_URL/health"
curl --fail --silent --show-error "$AI_GATEWAY_HEALTH_URL/health"
