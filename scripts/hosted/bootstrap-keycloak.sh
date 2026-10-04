#!/usr/bin/env bash
set -Eeuo pipefail

: "${KEYCLOAK_HOST:?KEYCLOAK_HOST is required}"
: "${KEYCLOAK_ADMIN_USERNAME:?KEYCLOAK_ADMIN_USERNAME is required}"
: "${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD is required}"

base_url="http://${KEYCLOAK_HOST}:8080"
realm_file="docker/integration/keycloak-realm.json"

[ -f "$realm_file" ] || {
  echo "Missing Keycloak realm fixture: $realm_file" >&2
  exit 1
}

token=$(curl --fail --silent --show-error \
  --request POST \
  --header 'content-type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=password' \
  --data-urlencode 'client_id=admin-cli' \
  --data-urlencode "username=${KEYCLOAK_ADMIN_USERNAME}" \
  --data-urlencode "password=${KEYCLOAK_ADMIN_PASSWORD}" \
  "${base_url}/realms/master/protocol/openid-connect/token" \
  | node -e "let input='';process.stdin.on('data',c=>input+=c).on('end',()=>{const body=JSON.parse(input);if(typeof body.access_token!=='string')process.exit(2);process.stdout.write(body.access_token);});")

status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --header "authorization: Bearer ${token}" \
  "${base_url}/admin/realms/platform")

case "$status" in
  200)
    printf '%s\n' 'PRENEURA hosted Keycloak realm already provisioned.'
    ;;
  404)
    curl --fail --silent --show-error \
      --request POST \
      --header "authorization: Bearer ${token}" \
      --header 'content-type: application/json' \
      --data-binary "@${realm_file}" \
      "${base_url}/admin/realms" >/dev/null
    printf '%s\n' 'PRENEURA hosted Keycloak realm provisioned.'
    ;;
  *)
    echo "Unexpected Keycloak realm lookup status: ${status}" >&2
    exit 1
    ;;
esac
