# Data policy

An endpoint's `data_policy` describes prompt retention, retention duration, training, and publication behavior.

## Endpoint and provider policy

Endpoints can override provider policy, so provider non-URL policy fields are not globally true for a provider.

- Differences include missing keys and overridden values.
- 🧭 Never use provider non-URL policy fields.
- 🧭 Use endpoint policy to describe an offering's behavior.

## Policy documents

Terms-of-service and privacy-policy URLs identify provider documents, not endpoint behavior.

- These URLs are stable across observed records for the same provider organization.
