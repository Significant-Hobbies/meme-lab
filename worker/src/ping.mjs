// Drop-in App Health log client (JavaScript port of ping.ts). One POST per
// call, never throws, silent no-op until APP_HEALTH_INGEST_KEY is set.
// Source: app-health/examples/dropin-log-client/ping.ts.

const DEFAULT_URL = 'https://ingest.sassmaker.com/v1/logs';
const DEFAULT_ENDPOINT_URL = 'https://ingest.sassmaker.com/v1/ingest';
const API_ENDPOINTS = {
  '/api/health': ['GET', 'HEAD'],
  '/api/recommend': ['POST'],
  '/api/feedback': ['POST'],
};

function cleanProps(props = {}) {
  const out = {};
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function buildBody(event, options, environment) {
  return JSON.stringify({
    batch_id: crypto.randomUUID(),
    schema_version: 'v1',
    environment,
    logs: [
      {
        log_id: crypto.randomUUID(),
        timestamp: Date.now(),
        event,
        level: options.level ?? 'info',
        title: options.title,
        description: options.description,
        icon: options.icon,
        props: cleanProps(options.props),
      },
    ],
  });
}

export function createPing(config = {}) {
  const send = async (event, options = {}) => {
    const key = config.key;
    if (!key) return false;
    const url = config.url ?? DEFAULT_URL;
    const environment = config.environment ?? 'production';
    const fetchImpl = config.fetch ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 3000);
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: buildBody(event, options, environment),
        signal: controller.signal,
      });
      if (res.ok) return true;
      config.onError?.(new Error(`ping ${event}: HTTP ${res.status}`));
      return false;
    } catch (err) {
      config.onError?.(err);
      return false;
    } finally {
      clearTimeout(timer);
    }
  };
  const withLevel = (level) => (event, options = {}) => send(event, { ...options, level });
  return Object.assign(send, {
    debug: withLevel('debug'),
    info: withLevel('info'),
    warn: withLevel('warn'),
    error: withLevel('error'),
  });
}

/** Ping bound to the Worker env binding. No-op until APP_HEALTH_INGEST_KEY exists. */
export function pingFor(env) {
  return createPing({
    key: typeof env.APP_HEALTH_INGEST_KEY === 'string' && env.APP_HEALTH_INGEST_KEY ? env.APP_HEALTH_INGEST_KEY : undefined,
    environment: typeof env.APP_HEALTH_ENVIRONMENT === 'string' && env.APP_HEALTH_ENVIRONMENT ? env.APP_HEALTH_ENVIRONMENT : 'production',
    onError: (err) => console.warn(JSON.stringify({ event: 'app_health_log_failed', error: err instanceof Error ? err.message : String(err) })),
  });
}

function endpointEnvironment(value) {
  if (typeof value !== 'string') return 'production';
  const normalized = value.trim().toLowerCase();
  return /^[a-z][a-z0-9-]{0,63}$/.test(normalized) ? normalized : 'production';
}

export function createEndpointReporter(config = {}) {
  return async ({ method, route, status_code, duration_ms } = {}) => {
    if (!config.key || !Object.hasOwn(API_ENDPOINTS, route) || !API_ENDPOINTS[route].includes(method))
      return false;
    if (!Number.isInteger(status_code) || status_code < 100 || status_code > 599) return false;
    if (typeof duration_ms !== 'number' || !Number.isFinite(duration_ms) || duration_ms < 0)
      return false;

    const body = JSON.stringify({
      batch_id: crypto.randomUUID(),
      schema_version: 'v1',
      runtime: 'worker',
      environment: config.environment ?? 'production',
      events: [
        {
          event_id: crypto.randomUUID(),
          timestamp: Date.now(),
          method,
          route,
          status_code,
          duration_ms: Math.min(Math.round(duration_ms), 600_000),
        },
      ],
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 3000);
    try {
      const response = await (config.fetch ?? fetch)(config.url ?? DEFAULT_ENDPOINT_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.key}` },
        body,
        signal: controller.signal,
      });
      if (response.ok) return true;
      config.onError?.(new Error(`endpoint ${route}: HTTP ${response.status}`));
      return false;
    } catch {
      config.onError?.(new Error(`endpoint ${route}: delivery failed`));
      return false;
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Endpoint metrics use the same optional private ingest key as owner logs. */
export function endpointFor(env) {
  const key =
    typeof env.APP_HEALTH_INGEST_KEY === 'string' && env.APP_HEALTH_INGEST_KEY
      ? env.APP_HEALTH_INGEST_KEY
      : undefined;
  return createEndpointReporter({
    key,
    environment: endpointEnvironment(env.APP_HEALTH_ENVIRONMENT),
    onError: (error) =>
      console.warn(JSON.stringify({ event: 'app_health_endpoint_failed', error: error.message })),
  });
}
