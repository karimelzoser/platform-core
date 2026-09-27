# Local media boundary

Development uploads are limited to 700,000 decoded bytes per request. The API
validates the authenticated tenant and reply permission, writes bytes beneath a
tenant-specific local directory, and registers only the metadata in
`messaging.media_uploads`. A failed registration removes the newly written file.
The browser receives a storage reference, never a filesystem path.

An outbound send claims each unexpired upload once in the same tenant transaction
that creates its message, attachment records, audit entry, and outbox event. The
claim checks all supplied metadata and the tenant. The worker reads committed
attachment metadata and passes typed references to a connector only after that
transaction commits. There is no public media download endpoint or production
provider adapter yet.

Codespaces keeps files under `.preview/media` until `preview:reset`. Production
Compose mounts the private `platform_media` volume at `/srv/platform/media` for
the API and read-only for the worker. Backups must include this volume alongside
PostgreSQL; restoring only one side can leave missing or unreferenced files.
Automated expired-file cleanup and S3-compatible storage remain release work.

Migration `0019_messaging_media_upload_registry.sql` is additive. To roll back
application images, retain this table and its data so already queued sends still
have their upload claims. A destructive rollback would require preserving the
upload-to-message links and files first; prefer a forward migration after a
failed deployment.
