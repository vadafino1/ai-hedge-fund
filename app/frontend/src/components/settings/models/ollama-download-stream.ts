import type { DownloadProgress } from './ollama-types';

function parseDownloadProgressLine(line: string): DownloadProgress | null {
  if (!line.startsWith('data: ')) {
    return null;
  }

  const jsonData = line.slice(6).trim();
  return jsonData ? JSON.parse(jsonData) as DownloadProgress : null;
}

function splitProgressLines(buffer: string): { lines: string[]; remainingBuffer: string } {
  const lines = buffer.split('\n');
  return {
    lines: lines.slice(0, -1),
    remainingBuffer: lines.at(-1) || '',
  };
}

function dispatchProgressLine(
  line: string,
  onProgress: (progress: DownloadProgress) => boolean | void,
): boolean {
  try {
    const progress = parseDownloadProgressLine(line.trimEnd());
    return progress ? onProgress(progress) !== false : true;
  } catch (error) {
    console.error('Error parsing progress data:', error, 'Line:', line);
    return true;
  }
}

function dispatchProgressLines(
  lines: string[],
  onProgress: (progress: DownloadProgress) => boolean | void,
): boolean {
  for (const line of lines) {
    if (!dispatchProgressLine(line, onProgress)) {
      return false;
    }
  }

  return true;
}

interface ProgressReadState {
  buffer: string;
  done: boolean;
  shouldContinue: boolean;
}

async function readNextProgressChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  state: ProgressReadState,
  onProgress: (progress: DownloadProgress) => boolean | void,
): Promise<ProgressReadState> {
  const readResult = await reader.read();
  if (readResult.done) {
    return { ...state, done: true };
  }

  const nextBuffer = state.buffer + decoder.decode(readResult.value, { stream: true });
  const { lines, remainingBuffer } = splitProgressLines(nextBuffer);
  return {
    buffer: remainingBuffer,
    done: false,
    shouldContinue: dispatchProgressLines(lines, onProgress),
  };
}

function dispatchFinalProgressLine(
  state: ProgressReadState,
  decoder: TextDecoder,
  onProgress: (progress: DownloadProgress) => boolean | void,
): void {
  if (!state.shouldContinue) return;

  const finalLine = `${state.buffer}${decoder.decode()}`;
  if (finalLine.trim()) {
    dispatchProgressLine(finalLine, onProgress);
  }
}

export async function readDownloadProgressStream(
  response: Pick<Response, 'body'>,
  onProgress: (progress: DownloadProgress) => boolean | void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let state: ProgressReadState = { buffer: '', done: false, shouldContinue: true };

  try {
    while (!state.done && state.shouldContinue) {
      state = await readNextProgressChunk(reader, decoder, state, onProgress);
    }

    dispatchFinalProgressLine(state, decoder, onProgress);
  } finally {
    reader.releaseLock();
  }
}
