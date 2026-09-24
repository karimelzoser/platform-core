# Release Checklist

- [ ] CI is green: format, lint, typecheck, tests, builds, migration/RLS, connector, Temporal, UI, AI gateway, and security gates.
- [ ] Historical migration checksums match production.
- [ ] Images are immutable digests with release metadata/SBOM.
- [ ] Backup and image rollback were validated.
- [ ] Production compose uses only `platform_internal` and does not alter n8n.
- [ ] Health and smoke tests pass without customer-data mutation.
- [ ] Threat model, runbook, release notes, and implementation status are current.
