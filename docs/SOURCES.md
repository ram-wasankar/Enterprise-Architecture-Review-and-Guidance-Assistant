# Source formats

All files under `data/` are fictional. The intentional retention conflict is a test case, not regulatory advice.

`REVIEW_DATA_DIR` selects the source directory. The default is the repository's `data/` directory. Provide `standards.json` and `leanix.json`; no uploaded commands or remote MCP URLs are accepted.

## Standards

`standards.json` is an array of records:

```json
[
  {
    "id": "SEC-01",
    "title": "Service authentication",
    "kinds": ["service"],
    "control": "authentication",
    "expected": "oidc",
    "recommendation": "Use the shared OIDC provider.",
    "excerpt": "All service entry points must authenticate using OIDC.",
    "revision": "approved-2026-11"
  }
]
```

`kinds` matches component kinds exactly; `*` applies to all kinds. Control values are compared case-insensitively after trimming outer whitespace. This version supports equality requirements. Convert richer policy statements into explicit, reviewable controls before importing. There is no implicit draft precedence or exception hierarchy: contradictory values are raised for human resolution.

## Inventory

Map your LeanIX export's stable application IDs, ownership, lifecycle, and relations to this normalized shape:

```json
{
  "exported_at": "2026-11-04T12:00:00Z",
  "applications": [
    {
      "id": "checkout-api",
      "name": "Checkout API",
      "owner": "Commerce Platform",
      "lifecycle": "active",
      "dependencies": ["orders-db"]
    }
  ]
}
```

Accepted lifecycle values: `active`, `phase-out`, `retired`. Missing ownership is represented by `null`. Dependencies are directional: application A depends on the IDs in A's dependencies array. IDs must be unique within each source; design component IDs must match inventory IDs for reconciliation. Export freshness is displayed, not automatically judged.

## Design

`data/design.json` is a complete example. Each component has an ID, name, kind, dependency IDs, and a string-valued controls dictionary. The API rejects duplicate component IDs and unknown top-level fields. A missing control creates a question for the reviewer; it is never inferred from the prose overview.
