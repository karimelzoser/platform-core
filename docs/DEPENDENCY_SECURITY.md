# Dependency security remediation

CI audits the full workspace and scans both API and hosted-preview runtime
images. Runtime images install production dependencies only and remove bundled
package managers that the application does not use. Debian packages are updated
when the images are built.

## Braces depth guard — CVE-2026-93687

Upstream braces 3.0.3 has no published patched release as of 2026-10-11.
The lockfile applies the checked-in pnpm patch to every braces installation.
It bounds parser nesting and validates caller-supplied ASTs iteratively before
compile, expand or stringify can recurse. Depth, node count and cycles are
bounded; normal build-glob behavior has regression coverage.

The audit exception is limited to this one CVE because npm advisory matching
cannot recognize a source patch without a new upstream version. It is not an
acceptance of the vulnerable code. The mandatory dependency-security command
executes attack regressions against the actually installed package before
running the audit. Missing or unapplied patches fail that gate.

Review this patch when upstream releases a fix; replace it with the supported
release and remove the exception together. Do not add other advisory exceptions
without equivalent reviewed remediation and executable evidence.

Reference: [GitHub advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
