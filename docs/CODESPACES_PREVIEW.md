# Codespaces Developer Preview

This preview is for development only. It uses disposable local containers and
non-production credentials; it never connects to the VPS, production database,
or provider accounts.

1. Open the GitHub repository, select **Code**, **Codespaces**, then **Create
   codespace on main**.
2. After the devcontainer setup finishes, run:

   ```sh
   corepack pnpm preview:up
   corepack pnpm preview:health
   ```

3. Open the automatically forwarded **Platform Web** port (3000), then open
   `/preview-login` and sign in. Admin is on
   port 3001 and API health is on port 4000. All are private forwarded ports.
   PostgreSQL, Valkey, NATS, Temporal, Keycloak, and OPA are bound only to the
   Codespace loopback and are not forwarded.

## Development identity

Keycloak imports two development-only users:

- username: `preview-owner`
- password: `preview-owner-password`
- tenant ID: `cccccccc-cccc-cccc-cccc-cccccccccccc`

The independent approver used only for safe merge-preview testing is:

- username: `preview-approver`
- password: `preview-approver-password`

It owns `Preview Tenant` and uses normal Keycloak JWT, membership, effective
permission, OPA, and PostgreSQL RLS paths. There is no authentication bypass.
The development-only `/preview-login` page exchanges these credentials with
Keycloak and writes HTTP-only, same-site session cookies for the selected
tenant. The route is unavailable outside development. Its cookies are
intentionally non-Secure only because the preview runs over loopback HTTP
inside the Codespace; the forwarded Codespaces edge remains HTTPS.
You can also inspect a real token from the terminal:

```sh
curl -s http://localhost:8080/realms/platform/protocol/openid-connect/token \
  -d grant_type=password -d client_id=platform-web \
  -d username=preview-owner -d password=preview-owner-password
```

Unfinished product surfaces intentionally remain marked as under development;
the preview does not invent data or claim unfinished workflows work.

## Reset and troubleshooting

```sh
corepack pnpm preview:down
corepack pnpm preview:reset
corepack pnpm preview:health
```

Inspect `.preview/*.log` for host application logs. For container diagnostics,
run `docker compose -f docker/integration/compose.yml -f docker/preview/compose.yml ps`.
If dependencies changed, rerun `corepack pnpm install --frozen-lockfile`.
Development media uploads are stored under `.preview/media`; `preview:reset`
removes them along with the disposable database state.
