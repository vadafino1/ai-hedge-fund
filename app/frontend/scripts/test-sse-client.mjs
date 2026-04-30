import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './import-typescript-module.mjs';

async function importSseClient() {
  return importTypeScriptModule('src/services/sse-client.ts', {
    tempDirName: 'ai-hedge-fund-sse-client-test',
    modulePrefix: 'sse-client',
  });
}

function createSseResponse(chunks) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  }));
}

async function collectEventsFromChunks(chunks) {
  const { startSsePostStream } = await importSseClient();
  const events = [];
  const completed = new Promise((resolve, reject) => {
    startSsePostStream({
      url: 'http://localhost/test-stream',
      body: {},
      fetchImpl: async () => createSseResponse(chunks),
      onEvent: event => events.push(event),
      onComplete: resolve,
      onError: reject,
    });
  });

  await completed;
  return events;
}

test('startSsePostStream posts JSON and parses event payloads', async () => {
  const { startSsePostStream } = await importSseClient();
  const events = [];
  const completed = new Promise((resolve, reject) => {
    startSsePostStream({
      url: 'http://localhost/test-stream',
      body: { ticker: 'AAPL' },
      fetchImpl: async (url, init) => {
        assert.equal(url, 'http://localhost/test-stream');
        assert.equal(init.method, 'POST');
        assert.equal(init.body, JSON.stringify({ ticker: 'AAPL' }));
        return createSseResponse([
          'event: progress\ndata: {"agent":"valuation_agent","status":"Done"}\n\n',
        ]);
      },
      onEvent: event => events.push(event),
      onComplete: resolve,
      onError: reject,
    });
  });

  await completed;
  assert.deepEqual(events, [{
    type: 'progress',
    data: {
      agent: 'valuation_agent',
      status: 'Done',
    },
    raw: 'event: progress\ndata: {"agent":"valuation_agent","status":"Done"}',
  }]);
});

test('startSsePostStream handles events split across chunks', async () => {
  const events = await collectEventsFromChunks([
    'event: start\ndata: {"run":"abc"',
    '}\n\nevent: complete\ndata: {"ok":true}\n\n',
  ]);

  assert.deepEqual(events.map(event => event.type), ['start', 'complete']);
  assert.deepEqual(events[0].data, { run: 'abc' });
  assert.deepEqual(events[1].data, { ok: true });
});

test('startSsePostStream continues after malformed event when onEventError is supplied', async () => {
  const { startSsePostStream } = await importSseClient();
  const events = [];
  const errors = [];
  const completed = new Promise((resolve, reject) => {
    startSsePostStream({
      url: 'http://localhost/test-stream',
      body: {},
      fetchImpl: async () => createSseResponse([
        'event: progress\ndata: not-json\n\n',
        'event: complete\ndata: {"ok":true}\n\n',
      ]),
      onEvent: event => events.push(event),
      onEventError: (error, rawEvent) => errors.push({ error, rawEvent }),
      onComplete: resolve,
      onError: reject,
    });
  });

  await completed;
  assert.equal(errors.length, 1);
  assert.match(errors[0].rawEvent, /not-json/);
  assert.deepEqual(events.map(event => event.type), ['complete']);
});

test('startSsePostStream handles CRLF delimiters and a final buffered event', async () => {
  const events = await collectEventsFromChunks([
    'event: progress\r\ndata: {"ok":1}\r\n\r\nevent: complete\r\ndata: {"done":true}',
  ]);

  assert.deepEqual(events.map(event => event.type), ['progress', 'complete']);
  assert.deepEqual(events[0].data, { ok: 1 });
  assert.deepEqual(events[1].data, { done: true });
});

test('startSsePostStream preserves custom HeadersInit values', async () => {
  const { startSsePostStream } = await importSseClient();
  const completed = new Promise((resolve, reject) => {
    startSsePostStream({
      url: 'http://localhost/test-stream',
      body: {},
      headers: new Headers([['X-Trace-Id', 'trace-123']]),
      fetchImpl: async (_url, init) => {
        const headers = new Headers(init.headers);
        assert.equal(headers.get('content-type'), 'application/json');
        assert.equal(headers.get('x-trace-id'), 'trace-123');
        return createSseResponse(['event: complete\ndata: {"ok":true}\n\n']);
      },
      onEvent: () => {},
      onComplete: resolve,
      onError: reject,
    });
  });

  await completed;
});

test('startSsePostStream ignores abort-like errors by name', async () => {
  const { startSsePostStream } = await importSseClient();
  let errorCalled = false;
  const abortError = new Error('aborted');
  abortError.name = 'AbortError';

  startSsePostStream({
    url: 'http://localhost/test-stream',
    body: {},
    fetchImpl: async () => {
      throw abortError;
    },
    onEvent: () => {},
    onError: () => {
      errorCalled = true;
    },
  });

  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(errorCalled, false);
});
