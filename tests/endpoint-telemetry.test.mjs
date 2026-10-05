import test from 'node:test';
import assert from 'node:assert/strict';
import { createEndpointReporter } from '../worker/src/ping.mjs';

test('endpoint reporter sends only the V1 route measurement fields', async () => {
  let sent;
  const reporter = createEndpointReporter({
    key: 'test-private-ingest-key',
    environment: 'test',
    fetch: async (url, options) => {
      sent = { url, options };
      return new Response(null, { status: 202 });
    },
  });

  const accepted = await reporter({
    method: 'POST',
    route: '/api/recommend',
    status_code: 503,
    duration_ms: 12.6,
    comment: 'private prompt must not be included',
    request_url: 'https://example.test/api/recommend?secret=value',
  });

  assert.equal(accepted, true);
  assert.equal(sent.url, 'https://ingest.sassmaker.com/v1/ingest');
  assert.equal(sent.options.headers.authorization, 'Bearer test-private-ingest-key');
  const batch = JSON.parse(sent.options.body);
  assert.equal(batch.schema_version, 'v1');
  assert.equal(batch.runtime, 'worker');
  assert.equal(batch.environment, 'test');
  assert.deepEqual(Object.keys(batch).sort(), [
    'batch_id',
    'environment',
    'events',
    'runtime',
    'schema_version',
  ]);
  assert.deepEqual(Object.keys(batch.events[0]).sort(), [
    'duration_ms',
    'event_id',
    'method',
    'route',
    'status_code',
    'timestamp',
  ]);
  assert.deepEqual(
    {
      method: batch.events[0].method,
      route: batch.events[0].route,
      status_code: batch.events[0].status_code,
      duration_ms: batch.events[0].duration_ms,
    },
    { method: 'POST', route: '/api/recommend', status_code: 503, duration_ms: 13 },
  );
  assert.doesNotMatch(sent.options.body, /private prompt|secret=value|request_url|comment/);
});

test('endpoint reporter is opt-in and rejects paths outside the fixed API route table', async () => {
  let calls = 0;
  const fetch = async () => {
    calls++;
    return new Response(null, { status: 202 });
  };
  const unconfigured = createEndpointReporter({ fetch });
  assert.equal(
    await unconfigured({ method: 'GET', route: '/api/health', status_code: 200, duration_ms: 1 }),
    false,
  );

  const configured = createEndpointReporter({ key: 'test-key', fetch });
  assert.equal(
    await configured({
      method: 'GET',
      route: '/api/recommend/user-123',
      status_code: 200,
      duration_ms: 1,
    }),
    false,
  );
  assert.equal(
    await configured({ method: 'GET', route: '/api/recommend', status_code: 200, duration_ms: 1 }),
    false,
  );
  assert.equal(calls, 0);
});

test('endpoint reporter swallows delivery errors', async () => {
  const reporter = createEndpointReporter({
    key: 'test-key',
    fetch: async () => {
      throw new Error('offline');
    },
  });

  assert.equal(
    await reporter({ method: 'GET', route: '/api/health', status_code: 200, duration_ms: 1 }),
    false,
  );
});

test('caption routes report bounded route names without situations or catalogue IDs',async()=>{
  const events=[];
  const report=createEndpointReporter({key:'test-key',fetch:async(_,options)=>{events.push(...JSON.parse(options.body).events);return new Response(null,{status:202});}});
  for(const [method,route] of [['POST','/api/create'],['POST','/api/anna/composition'],['GET','/api/create/media/{id}']]){
    assert.equal(await report({method,route,status_code:503,duration_ms:5,comment:'private caption',candidate_id:'private-template'}),true);
  }
  assert.equal(await report({method:'GET',route:'/api/create/media/private-template',status_code:200,duration_ms:1}),false);
  assert.equal(events.length,3);
  assert.doesNotMatch(JSON.stringify(events),/private caption|private-template|comment|candidate_id/);
});
