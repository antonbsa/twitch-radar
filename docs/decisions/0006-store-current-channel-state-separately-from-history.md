# 0006 - Store Current Channel State Separately From State History

## Status

Accepted

## Context

Twitch EventSub events provide current event data, not a complete previous/current diff tailored to this app's matching rules. Category notifications need previous-vs-next comparisons.

## Decision

Store current broadcaster state in `channel_state`.

Store relevant transitions in `channel_state_changes`.

Do not use `channel_state_changes` as the only source of current state.

Persist state tables in D1 with the schema represented by `infra/migrations`.

Store transition records only for meaningful changes:

- stream started;
- stream ended;
- category changed while live;
- channel entered a desired category;
- channel left a desired category.

## Consequences

- Event processing must load previous `channel_state` before writing next state.
- `channel_state_changes` remains audit/deduplication/history, not the current snapshot.
- State seeding is required when a channel becomes monitored.
