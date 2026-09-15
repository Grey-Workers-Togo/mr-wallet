# ADR-0005 — Ingestion by file import, not third-party connectors

## Status
Accepted — 2026-07-28

## Context
The initial idea was to fetch data automatically from third-party services (Gozem, Deliveroo, banks) with the user's consent. In practice, these platforms expose no public API allowing a third party to read a user's transaction history; such access assumes a commercial partnership, not a simple OAuth flow. Regulated banking aggregators exist but are paid and carry compliance obligations.

## Decision
In V1 and V2, data enters only through manual entry or CSV/Excel import. The `import` module is designed as a generic pipeline (reusable mapping source, error-tolerant parsing, deduplication), so that an automatic connector could one day feed the same chain.

## Consequences
- **Benefit**: no external contractual or technical dependency; the product works from day one.
- **Cost**: manual import is the product's main friction point and probably the leading cause of abandonment. This is why the quality of the import wizard is treated as a first-class feature, not a utility.
- **To measure**: the 30-day return rate, as an indicator of how acceptable the import effort is.

## Later development
[ADR-0013](0013-native-ingestion-channels.md) does not reopen third-party connectors — it reprioritizes the *channels* through which files and data reach the same pipeline, now that a native client makes share sheets, the camera and platform APIs available.
