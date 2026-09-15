# ADR-0001 — Modular monolith rather than microservices

## Status
Accepted — 2026-07-28

## Context
The initial requirement was "each type will be a module on the back end". That can mean microservices, or a monolith with strict modules. The product serves individuals consulting their own data; expected volumes are on the order of a few thousand transactions per user. Several business operations span domains and must be atomic (recording a debt repayment creates a transaction and updates a balance).

## Decision
A single NestJS deployment, split into modules with strict boundaries, each exposing a facade. The inter-module dependency graph is documented and must remain acyclic.

## Consequences
- **Benefit**: trivial ACID transactions, simple deployment and operation, a single repository, zero latency between modules.
- **Cost**: modular discipline is not enforced by the network; it has to be verified (code review, a lint rule on cross-imports).
- **Open**: a module can be extracted later if a scaling need appears, with the facade serving as the boundary.
