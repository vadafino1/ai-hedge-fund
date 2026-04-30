export interface ParsedSseEvent<TData = unknown> {
  type: string;
  data: TData;
  raw: string;
}

interface StreamSseResponseOptions<TData = unknown> {
  onEvent: (event: ParsedSseEvent<TData>) => void | Promise<void>;
  onEventError?: (error: unknown, rawEvent: string) => void;
}

export interface StartSsePostStreamOptions<TData = unknown> extends StreamSseResponseOptions<TData> {
  url: string;
  body: unknown;
  headers?: HeadersInit;
  fetchImpl?: typeof fetch;
  onComplete?: () => void;
  onError: (error: Error) => void;
}

interface SplitSseBufferResult {
  rawEvents: string[];
  remainingBuffer: string;
}

function readSseField(eventText: string, fieldName: string): string | null {
  const prefix = `${fieldName}:`;
  const values = eventText
    .split(/\r?\n/)
    .filter(line => line.startsWith(prefix))
    .map(line => {
      const value = line.slice(prefix.length);
      return value.startsWith(' ') ? value.slice(1) : value;
    });

  return values.length > 0 ? values.join('\n') : null;
}

function parseSseEvent<TData = unknown>(eventText: string): ParsedSseEvent<TData> | null {
  const type = readSseField(eventText, 'event') || 'message';
  const dataText = readSseField(eventText, 'data');

  if (dataText === null) {
    return null;
  }

  return {
    type,
    data: JSON.parse(dataText) as TData,
    raw: eventText,
  };
}

function splitSseBuffer(buffer: string): SplitSseBufferResult {
  const rawEvents = buffer.split(/\r?\n\r?\n/);
  return {
    rawEvents: rawEvents.slice(0, -1),
    remainingBuffer: rawEvents.at(-1) || '',
  };
}

function getResponseReader(response: Response): ReadableStreamDefaultReader<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Failed to get response reader');
  }

  return reader;
}

function handleRawEventParseError(
  error: unknown,
  rawEvent: string,
  onEventError: StreamSseResponseOptions['onEventError']
): void {
  if (onEventError) {
    onEventError(error, rawEvent);
    return;
  }

  throw error;
}

function safeParseSseEvent<TData>(
  rawEvent: string,
  options: StreamSseResponseOptions<TData>
): ParsedSseEvent<TData> | null {
  try {
    return parseSseEvent<TData>(rawEvent);
  } catch (error) {
    handleRawEventParseError(error, rawEvent, options.onEventError);
    return null;
  }
}

async function dispatchRawEvent<TData>(
  rawEvent: string,
  options: StreamSseResponseOptions<TData>
): Promise<void> {
  if (!rawEvent.trim()) return;

  const parsedEvent = safeParseSseEvent(rawEvent, options);
  if (!parsedEvent) return;

  await options.onEvent(parsedEvent);
}

async function dispatchRawEvents<TData>(
  rawEvents: string[],
  options: StreamSseResponseOptions<TData>
): Promise<void> {
  for (const rawEvent of rawEvents) {
    await dispatchRawEvent(rawEvent, options);
  }
}

async function processChunk<TData>(
  buffer: string,
  chunk: Uint8Array,
  decoder: TextDecoder,
  options: StreamSseResponseOptions<TData>
): Promise<string> {
  const nextBuffer = buffer + decoder.decode(chunk, { stream: true });
  const { rawEvents, remainingBuffer } = splitSseBuffer(nextBuffer);
  await dispatchRawEvents(rawEvents, options);
  return remainingBuffer;
}

async function streamSseResponse<TData = unknown>(
  response: Response,
  options: StreamSseResponseOptions<TData>
): Promise<void> {
  const reader = getResponseReader(response);
  const decoder = new TextDecoder();
  let buffer = '';
  let readResult = await reader.read();

  while (!readResult.done) {
    buffer = await processChunk(buffer, readResult.value, decoder, options);
    readResult = await reader.read();
  }

  await dispatchRawEvent(buffer + decoder.decode(), options);
}

function getErrorName(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('name' in error)) {
    return undefined;
  }

  return String(error.name);
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}

function isAbortError(error: unknown): boolean {
  return getErrorName(error) === 'AbortError';
}

function buildJsonHeaders(headers?: HeadersInit): Headers {
  const requestHeaders = new Headers({ 'Content-Type': 'application/json' });
  new Headers(headers).forEach((value, key) => {
    requestHeaders.set(key, value);
  });
  return requestHeaders;
}

async function openSsePostResponse<TData>(
  options: StartSsePostStreamOptions<TData>,
  signal: AbortSignal
): Promise<Response> {
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(options.url, {
    method: 'POST',
    headers: buildJsonHeaders(options.headers),
    body: JSON.stringify(options.body),
    signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response;
}

function handleSsePostError<TData>(error: unknown, options: StartSsePostStreamOptions<TData>): void {
  if (isAbortError(error)) {
    return;
  }

  options.onError(toError(error));
}

async function runSsePostStream<TData>(
  options: StartSsePostStreamOptions<TData>,
  signal: AbortSignal
): Promise<void> {
  try {
    const response = await openSsePostResponse(options, signal);
    await streamSseResponse(response, {
      onEvent: options.onEvent,
      onEventError: options.onEventError,
    });
    options.onComplete?.();
  } catch (error) {
    handleSsePostError(error, options);
  }
}

export function startSsePostStream<TData = unknown>(options: StartSsePostStreamOptions<TData>): () => void {
  const controller = new AbortController();
  void runSsePostStream(options, controller.signal);
  return () => controller.abort();
}
