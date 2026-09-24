# 1. TypeBox as the single schema source

## Status
Accepted.

## Context
The specification asks for an OpenAPI 3.1 document "generated from the same
schemas the server validates with, and keep it accurate". Two obvious routes
exist: Zod with a JSON Schema converter, or TypeBox.

Zod is the more familiar library, but its schemas are not JSON Schema. A
converter sits between validation and documentation, and every converter has
gaps — which is exactly where a document drifts from the server without anyone
noticing.

## Decision
TypeBox, through `@fastify/type-provider-typebox`. A TypeBox schema *is* a JSON
Schema object. Fastify validates with it directly and `@fastify/swagger` emits
the same object into the document. There is no conversion step to drift.

## Consequences
The document is accurate by construction rather than by discipline.

Cross-field rules that JSON Schema cannot express — R-01, R-12, the mutual
exclusion of `endDate` and `endAfterOccurrences` — are validated in
`domain/validation.ts` after the schema pass, and are described in prose in the
README rather than appearing in the document as machine-readable constraints.

TypeBox is less widely known than Zod, so `Type.Unsafe` appears where a raw
JSON Schema construct is wanted, notably the discriminated rule union.
