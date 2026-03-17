# DELIVERY_RULES.md

## Delivery philosophy

Ship a focused product.
Avoid drift, unnecessary abstraction, and V2 leakage.

## Repo workflow

### Branching
Use short-lived feature branches.

Suggested naming:
- `feature/...`
- `fix/...`
- `docs/...`
- `refactor/...` only when explicitly justified

### Pull request rule
Every meaningful code change should be reviewable as a coherent unit.
Do not mix unrelated changes in one PR.

## Change-control rules

Before implementing:
- check `MVP_SCOPE.md`
- check `PROJECT_DOC.md`
- check `AGENT.md`

If a request conflicts with locked scope:
- do not silently expand scope
- classify it as current scope or future scope
- keep the build focused

## Coding rules

- prefer simple over clever
- prefer explicit naming over short naming
- keep modules separated
- do not create random shared utilities without need
- do not refactor working code casually
- do not introduce new dependencies casually
- avoid hidden side effects

## Architecture rules

- preserve async webhook -> persist -> queue -> worker flow
- keep provider integrations behind adapters
- keep merchant-facing configuration explicit
- keep logs and supportability visible
- prefer implementation clarity over abstraction purity

## Documentation rules

Update docs whenever these change:
- architecture
- module boundaries
- event contracts
- env vars
- onboarding flow
- analytics definitions
- launch assumptions
- operational procedures

## Task rules

Every implementation task should have:
- clear goal
- output
- dependency
- proof of completion

Do not keep vague tasks open.

## Definition of done

A task is done only when:
- code is implemented
- it matches scope
- basic validation exists
- docs are updated if required
- logs/status visibility exist where relevant
- obvious edge cases are not ignored

## QA rule

Do not rely on “should work”.
Critical flows must be exercised against real or realistic test paths.

## Launch rule

Beta launch requires:
- release blockers reviewed
- support visibility ready
- known issues documented
- rollback or recovery steps available

## Final operating rule

This repo is not a playground.
Every change should move the product toward a shippable release.