import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './import-typescript-module.mjs';

async function importNodeUtils() {
  return importTypeScriptModule('src/nodes/utils.ts', {
    tempDirName: 'ai-hedge-fund-flow-run-config-test',
    modulePrefix: 'node-utils',
  });
}

test('prepareNodeRunPayload includes only nodes reachable from the run root', async () => {
  const { prepareNodeRunPayload } = await importNodeUtils();

  const result = prepareNodeRunPayload({
    rootNodeId: 'start',
    nodes: [
      { id: 'start', type: 'portfolio-start', data: { label: 'root' }, position: { x: 0, y: 0 } },
      { id: 'agent-a', type: 'agent', data: { role: 'a' }, position: { x: 100, y: 0 } },
      { id: 'agent-b', type: 'agent', data: { role: 'b' }, position: { x: 200, y: 0 } },
      { id: 'isolated', type: 'agent', data: { role: 'isolated' }, position: { x: 0, y: 200 } },
    ],
    edges: [
      { id: 'e-start-a', source: 'start', target: 'agent-a' },
      { id: 'e-a-b', source: 'agent-a', target: 'agent-b' },
      { id: 'e-b-a', source: 'agent-b', target: 'agent-a' },
      { id: 'e-isolated-b', source: 'isolated', target: 'agent-b' },
    ],
    agentModelsByNodeId: {
      'agent-a': { display_name: 'Claude', model_name: 'claude-3-5-sonnet', provider: 'Anthropic' },
      'agent-b': null,
      isolated: { display_name: 'GPT', model_name: 'gpt-4.1', provider: 'OpenAI' },
    },
  });

  assert.deepEqual(result.graph_nodes.map(node => node.id), ['agent-a', 'agent-b']);
  assert.deepEqual(result.graph_edges.map(edge => edge.id), ['e-start-a', 'e-a-b', 'e-b-a']);
  assert.deepEqual(result.agent_models, [
    {
      agent_id: 'agent-a',
      model_name: 'claude-3-5-sonnet',
      model_provider: 'Anthropic',
    },
  ]);
});

test('prepareNodeRunPayload preserves graph node shape expected by run APIs', async () => {
  const { prepareNodeRunPayload } = await importNodeUtils();

  const result = prepareNodeRunPayload({
    rootNodeId: 'root',
    nodes: [
      { id: 'root', type: 'stock-analyzer', data: { ignored: true }, position: { x: 1, y: 2 } },
      { id: 'agent', type: 'agent', data: { name: 'value-agent' }, position: { x: 3, y: 4 } },
    ],
    edges: [
      { id: 'root-agent', source: 'root', target: 'agent', type: 'smoothstep', data: { weight: 1 } },
    ],
    agentModelsByNodeId: {},
  });

  assert.deepEqual(result.graph_nodes, [
    { id: 'agent', type: 'agent', data: { name: 'value-agent' }, position: { x: 3, y: 4 } },
  ]);
  assert.deepEqual(result.graph_edges, [
    { id: 'root-agent', source: 'root', target: 'agent', type: 'smoothstep', data: { weight: 1 } },
  ]);
  assert.deepEqual(result.agent_models, []);
});
