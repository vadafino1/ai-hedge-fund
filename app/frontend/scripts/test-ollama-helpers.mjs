import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { importTypeScriptModule } from './import-typescript-module.mjs';

const modelHelpers = await importTypeScriptModule(
  'src/components/settings/models/ollama-models.ts',
  { modulePrefix: 'ollama-models' },
);

const streamHelpers = await importTypeScriptModule(
  'src/components/settings/models/ollama-download-stream.ts',
  { modulePrefix: 'ollama-download-stream' },
);

const {
  buildOllamaModelList,
  formatBytes,
  getDownloadStatusLabel,
  isTerminalDownloadStatus,
} = modelHelpers;

const {
  readDownloadProgressStream,
} = streamHelpers;

function createStreamResponse(chunks) {
  const encoder = new TextEncoder();
  return {
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
  };
}

describe('Ollama model helpers', () => {
  it('builds downloaded models first and filters active downloads', () => {
    const models = buildOllamaModelList({
      availableModels: ['zeta:latest', 'llama3:8b'],
      recommendedModels: [
        { display_name: 'Alpha Model', model_name: 'alpha:latest', provider: 'Ollama' },
        { display_name: 'Llama 3 8B', model_name: 'llama3:8b', provider: 'Ollama' },
        { display_name: 'Beta Model', model_name: 'beta:latest', provider: 'Ollama' },
      ],
      activeDownloads: new Set(['alpha:latest']),
    });

    assert.deepEqual(
      models.map(model => ({ name: model.model_name, display: model.display_name, downloaded: model.isDownloaded })),
      [
        { name: 'llama3:8b', display: 'Llama 3 8B', downloaded: true },
        { name: 'zeta:latest', display: 'zeta:latest', downloaded: true },
        { name: 'beta:latest', display: 'Beta Model', downloaded: false },
      ],
    );
  });

  it('formats byte counts for progress displays', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(1536), '1.5 KB');
    assert.equal(formatBytes(5 * 1024 * 1024), '5 MB');
  });

  it('classifies terminal download statuses and labels unknown statuses', () => {
    assert.equal(isTerminalDownloadStatus('completed'), true);
    assert.equal(isTerminalDownloadStatus('error'), true);
    assert.equal(isTerminalDownloadStatus('cancelled'), true);
    assert.equal(isTerminalDownloadStatus('downloading'), false);
    assert.equal(getDownloadStatusLabel('downloading'), 'Downloading');
    assert.equal(getDownloadStatusLabel('completed'), 'Completed');
    assert.equal(getDownloadStatusLabel('custom-phase'), 'custom-phase');
  });
});

describe('Ollama download stream helpers', () => {
  it('streams split progress lines and stops after terminal progress', async () => {
    const response = createStreamResponse([
      'data: {"status":"down',
      'loading","percentage":50}\n',
      'data: {"status":"completed","percentage":100}\n',
      'data: {"status":"downloading","percentage":101}\n',
    ]);
    const received = [];

    await readDownloadProgressStream(response, progress => {
      received.push(progress);
      return progress.status !== 'completed';
    });

    assert.deepEqual(received, [
      { status: 'downloading', percentage: 50 },
      { status: 'completed', percentage: 100 },
    ]);
  });
});
