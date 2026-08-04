# Data policy

An endpoint's `data_policy` is the authoritative policy description for that offering. Provider
policy is not safely inherited because an endpoint can override it.

Consequently, a claim such as "this provider does not retain prompts" cannot be established from
the provider record alone. The defensible claim is endpoint-scoped, or an aggregate statement that
has checked every relevant endpoint.

Observed endpoint policy fields include prompt retention, retention duration, training, and
publication behavior. Differences between endpoint and provider policy are often differences in
key presence, but real value overrides also occur and are meaningful.

Policy-document URLs, including terms-of-service and privacy-policy URLs, have been observed to be
stable across records for the same provider organization. These identify provider documents rather
than endpoint behavior.
