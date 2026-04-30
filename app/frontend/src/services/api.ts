import type { NodeStatus, OutputNodeData, useNodeContext } from '@/contexts/node-context';
import type { Agent } from '@/data/agents';
import type { LanguageModel } from '@/data/models';
import { extractBaseAgentKey } from '@/data/node-mappings';
import { getStoredExecutionMode } from '@/services/execution-mode';
import {
  completeFlowConnectionIfStillConnected,
  markFlowConnectionCompleted,
  markFlowConnectionError,
  markFlowConnectionIdle,
} from '@/services/flow-connection-manager';
import { startSsePostStream, type ParsedSseEvent } from '@/services/sse-client';
import type {
  HedgeFundRequest,
  SandboxStatus
} from '@/services/types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

type NodeContext = ReturnType<typeof useNodeContext>;

interface HedgeFundStreamData {
  agent?: string;
  status?: string;
  ticker?: string | null;
  analysis?: string | null;
  timestamp?: string;
  data?: OutputNodeData;
  message?: string;
}

interface HedgeFundStreamContext {
  agentIds: string[];
  flowId: string | null;
  nodeContext: NodeContext;
}

function getAgentIds(params: HedgeFundRequest): string[] {
  return params.graph_nodes.map(node => node.id);
}

function resolveAgentNodeId(agentName: string, agentIds: string[]): string {
  const baseAgentKey = agentName.replace('_agent', '');
  return agentIds.find(id => extractBaseAgentKey(id) === baseAgentKey) || baseAgentKey;
}

function handleHedgeFundProgress(eventData: HedgeFundStreamData, context: HedgeFundStreamContext): void {
  if (!eventData.agent) return;

  const nodeStatus: NodeStatus = eventData.status === 'Done' ? 'COMPLETE' : 'IN_PROGRESS';
  const uniqueNodeId = resolveAgentNodeId(eventData.agent, context.agentIds);

  context.nodeContext.updateAgentNode(context.flowId, uniqueNodeId, {
    status: nodeStatus,
    ticker: eventData.ticker,
    message: eventData.status,
    analysis: eventData.analysis,
    timestamp: eventData.timestamp,
  });
}

function handleHedgeFundComplete(eventData: HedgeFundStreamData, context: HedgeFundStreamContext): void {
  if (eventData.data) {
    context.nodeContext.setOutputNodeData(context.flowId, eventData.data);
  }

  context.nodeContext.updateAgentNodes(context.flowId, context.agentIds, 'COMPLETE');
  context.nodeContext.updateAgentNode(context.flowId, 'output', {
    status: 'COMPLETE',
    message: 'Analysis complete',
  });

  markFlowConnectionCompleted(context.flowId);
}

function handleHedgeFundError(eventData: HedgeFundStreamData, context: HedgeFundStreamContext): void {
  context.nodeContext.updateAgentNodes(context.flowId, context.agentIds, 'ERROR');
  markFlowConnectionError(context.flowId, eventData.message || 'Unknown error occurred');
}

type HedgeFundStreamHandler = (eventData: HedgeFundStreamData, context: HedgeFundStreamContext) => void;

const hedgeFundStreamHandlers: Record<string, HedgeFundStreamHandler> = {
  start: (_eventData, context) => context.nodeContext.resetAllNodes(context.flowId),
  progress: handleHedgeFundProgress,
  complete: handleHedgeFundComplete,
  error: handleHedgeFundError,
};

function handleHedgeFundStreamEvent(
  event: ParsedSseEvent<HedgeFundStreamData>,
  context: HedgeFundStreamContext
): void {
  console.log(`Parsed ${event.type} event:`, event.data);

  const handler = hedgeFundStreamHandlers[event.type];
  if (!handler) {
    console.warn('Unknown event type:', event.type);
    return;
  }

  handler(event.data, context);
}

function handleHedgeFundConnectionError(error: Error, context: HedgeFundStreamContext, message: string): void {
  console.error('SSE connection error:', error);
  context.nodeContext.updateAgentNodes(context.flowId, context.agentIds, 'ERROR');
  markFlowConnectionError(context.flowId, error.message || message);
}

export const api = {
  getSandboxStatus: async (): Promise<SandboxStatus> => {
    const response = await fetch(`${API_BASE_URL}/sandbox/status`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  },

  /**
   * Gets the list of available agents from the backend
   * @returns Promise that resolves to the list of agents
   */
  getAgents: async (): Promise<Agent[]> => {
    try {
      const response = await fetch(`${API_BASE_URL}/hedge-fund/agents`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.agents;
    } catch (error) {
      console.error('Failed to fetch agents:', error);
      throw error;
    }
  },

  /**
   * Gets the list of available models from the backend
   * @returns Promise that resolves to the list of models
   */
  getLanguageModels: async (): Promise<LanguageModel[]> => {
    try {
      const response = await fetch(`${API_BASE_URL}/language-models/`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.models;
    } catch (error) {
      console.error('Failed to fetch models:', error);
      throw error;
    }
  },

  /**
   * Saves JSON data to a file in the project's /outputs directory
   * @param filename The name of the file to save
   * @param data The JSON data to save
   * @returns Promise that resolves when the file is saved
   */
  saveJsonFile: async (filename: string, data: unknown): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/storage/save-json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename,
          data,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log(result.message);
    } catch (error) {
      console.error('Failed to save JSON file:', error);
      throw error;
    }
  },

  /**
   * Runs a hedge fund simulation with the given parameters and streams the results
   * @param params The hedge fund request parameters
   * @param nodeContext Node context for updating node states
   * @param flowId The ID of the current flow
   * @returns A function to abort the SSE connection
   */
  runHedgeFund: (
    params: HedgeFundRequest,
    nodeContext: NodeContext,
    flowId: string | null = null
  ): (() => void) => {
    const tickers = typeof params.tickers === 'string'
      ? (params.tickers as unknown as string).split(',').map(t => t.trim())
      : params.tickers;
    const backendParams: HedgeFundRequest = {
      ...params,
      tickers,
      execution_mode: params.execution_mode || getStoredExecutionMode(),
    };
    const context: HedgeFundStreamContext = {
      agentIds: getAgentIds(backendParams),
      flowId,
      nodeContext,
    };

    const abortStream = startSsePostStream<HedgeFundStreamData>({
      url: `${API_BASE_URL}/hedge-fund/run`,
      body: backendParams,
      onEvent: event => handleHedgeFundStreamEvent(event, context),
      onComplete: () => completeFlowConnectionIfStillConnected(flowId),
      onError: error => handleHedgeFundConnectionError(error, context, 'Connection failed'),
      onEventError: (error, rawEvent) => console.error('Error parsing SSE event:', error, 'Raw event:', rawEvent),
    });

    return () => {
      abortStream();
      markFlowConnectionIdle(flowId);
    };
  },
};
