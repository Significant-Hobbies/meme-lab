# Production picker monitoring

The public Worker sends endpoint measurements and explicit failures or
degradation to the Meme Lab production environment in App Health. Those
records distinguish low-confidence retrieval fallback from successful ranking.

The hourly GitHub production picker check also sends `production.probe.passed`
or error-level `production.probe.failed` to the same App Health app. Reporting
covers an unreachable public site as well as HTTP 200 degradation. Events are
marked `synthetic:true` and contain only fixed case names, statuses, durations,
release SHA and the GitHub run URL. Submitted comments and provider error bodies
are not forwarded.

Monitoring uses a dedicated key scoped to the existing Meme Lab production
environment. It is retained in the Fleet production vault under
`MEME_LAB_MONITOR_APP_HEALTH_INGEST_KEY` and supplied to GitHub Actions through
the repository secret `APP_HEALTH_INGEST_KEY`. This key was configured on
2026-10-04 without rotating the Worker's existing key. Do not paste keys into
source, logs or chat. The workflow fails explicitly when reporting is missing
or rejected; a green required-reporting run means both the picker check and
App Health ingest succeeded.

The workflow's probe receipt also records allowlisted confidence and ranking
mode, whether the API marked the response as a fallback, and whether all three
perspectives are present. Strict failure criteria are unchanged. These fields
distinguish a genuine low-confidence selection from degraded routing without
including comments, provider bodies or request headers.

App Health's Overview feed must include production error logs and warning-level
`*.degraded` logs to surface these outcomes independently of its 20-request
aggregate-health threshold. Overview alerts remain retained occurrences rather
than automatic incident resolution. In-app visibility does not prove delivery
to an external notification channel while the dashboard is closed.
