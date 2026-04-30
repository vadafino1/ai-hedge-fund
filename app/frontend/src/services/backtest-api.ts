import type { NodeStatus, OutputNodeData, useNodeContext } from '@/contexts/node-context';
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
  BacktestDayResult,
  BacktestPerformanceMetrics,
  BacktestRequest
} from '@/services/types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

type NodeContext = ReturnType<typeof useNodeContext>;

interface BacktestCompleteData {
  performance_metrics?: BacktestPerformanceMetrics;
  final_portfolio?: OutputNodeData['final_portfolio'];
  total_days?: number;
}

interface BacktestStreamData {
  agent?: string;
  status?: string;
  ticker?: string | null;
  analysis?: string;
  timestamp?: string;
  data?: BacktestCompleteData;
  message?: string;
}

interface BacktestStreamState {
  results: BacktestDayResult[];
}

interface BacktestStreamContext {
  flowId: string | null;
  nodeContext: NodeContext;
  params: BacktestRequest;
  state: BacktestStreamState;
}

function resolveAgentNodeId(agentName: string, params: BacktestRequest): string {
  const baseAgentKey = agentName.replace('_agent', '');
  const agentIds = params.graph_nodes.map(node => node.id);
  return agentIds.find(id => extractBaseAgentKey(id) === baseAgentKey) || baseAgentKey;
}

function handleAgentProgress(eventData: BacktestStreamData, context: BacktestStreamContext): void {
  if (!eventData.agent || eventData.agent === 'backtest') return;

  const nodeStatus: NodeStatus = eventData.status === 'Done' ? 'COMPLETE' : 'IN_PROGRESS';
  const uniqueNodeId = resolveAgentNodeId(eventData.agent, context.params);

  context.nodeContext.updateAgentNode(context.flowId, uniqueNodeId, {
    status: nodeStatus,
    ticker: eventData.ticker,
    message: eventData.status,
    analysis: eventData.analysis,
    timestamp: eventData.timestamp,
  });
}

function appendBacktestResult(eventData: BacktestStreamData, state: BacktestStreamState): void {
  if (!eventData.analysis) return;

  try {
    const backtestResultData = JSON.parse(eventData.analysis) as BacktestDayResult;
    state.results = [...state.results, backtestResultData].slice(-50);
  } catch (error) {
    console.error('Error parsing backtest result data:', error);
  }
}

function handleBacktestProgress(eventData: BacktestStreamData, context: BacktestStreamContext): void {
  if (eventData.agent !== 'backtest') return;

  appendBacktestResult(eventData, context.state);
  context.nodeContext.updateAgentNode(context.flowId, 'backtest', {
    status: 'IN_PROGRESS',
    message: eventData.status,
    backtestResults: context.state.results,
  });
}

function handleProgress(eventData: BacktestStreamData, context: BacktestStreamContext): void {
  handleAgentProgress(eventData, context);
  handleBacktestProgress(eventData, context);
}

function handleComplete(eventData: BacktestStreamData, context: BacktestStreamContext): void {
  if (eventData.data) {
    context.nodeContext.setOutputNodeData(context.flowId, {
      decisions: { backtest: { type: 'backtest_complete' } },
      analyst_signals: {},
      performance_metrics: eventData.data.performance_metrics,
      final_portfolio: eventData.data.final_portfolio,
      total_days: eventData.data.total_days,
    });
  }

  context.nodeContext.updateAgentNode(context.flowId, 'backtest', {
    status: 'COMPLETE',
    message: 'Backtest completed successfully',
  });
  context.nodeContext.updateAgentNode(context.flowId, 'output', {
    status: 'COMPLETE',
    message: 'Backtest analysis complete',
  });

  markFlowConnectionCompleted(context.flowId);
}

function handleBacktestError(eventData: BacktestStreamData, context: BacktestStreamContext): void {
  context.nodeContext.updateAgentNode(context.flowId, 'portfolio-start', {
    status: 'ERROR',
    message: eventData.message || 'Backtest failed',
  });
  markFlowConnectionError(context.flowId, eventData.message || 'Unknown error occurred');
}

type BacktestStreamHandler = (eventData: BacktestStreamData, context: BacktestStreamContext) => void;

const backtestStreamHandlers: Record<string, BacktestStreamHandler> = {
  start: (_eventData, context) => {
    context.nodeContext.resetAllNodes(context.flowId);
    context.state.results = [];
    context.nodeContext.updateAgentNode(context.flowId, 'backtest', {
      status: 'IN_PROGRESS',
      message: 'Starting backtest...',
      backtestResults: [],
    });
  },
  progress: handleProgress,
  complete: handleComplete,
  error: handleBacktestError,
};

function handleBacktestStreamEvent(
  event: ParsedSseEvent<BacktestStreamData>,
  context: BacktestStreamContext
): void {
  console.log(`Parsed backtest ${event.type} event:`, event.data);

  const handler = backtestStreamHandlers[event.type];
  if (!handler) {
    console.warn('Unknown backtest event type:', event.type);
    return;
  }

  handler(event.data, context);
}

function handleBacktestConnectionError(error: Error, context: BacktestStreamContext): void {
  console.error('Backtest SSE connection error:', error);
  context.nodeContext.updateAgentNode(context.flowId, 'portfolio-start', {
    status: 'ERROR',
    message: 'Failed to connect to backtest service',
  });
  markFlowConnectionError(context.flowId, error.message || 'Connection failed');
}

export const backtestApi = {
  /**
   * Runs a backtest simulation with the given parameters and streams the results
   * @param params The backtest request parameters
   * @param nodeContext Node context for updating node states
   * @param flowId The ID of the current flow
   * @returns A function to abort the SSE connection
   */
  runBacktest: (
    params: BacktestRequest,
    nodeContext: NodeContext,
    flowId: string | null = null
  ): (() => void) => {
    const context: BacktestStreamContext = {
      flowId,
      nodeContext,
      params,
      state: { results: [] },
    };

    const abortStream = startSsePostStream<BacktestStreamData>({
      url: `${API_BASE_URL}/hedge-fund/backtest`,
      body: { ...params, execution_mode: params.execution_mode || getStoredExecutionMode() },
      onEvent: event => handleBacktestStreamEvent(event, context),
      onComplete: () => completeFlowConnectionIfStillConnected(flowId),
      onError: error => handleBacktestConnectionError(error, context),
      onEventError: (error, rawEvent) => console.error('Error parsing backtest SSE event:', error, 'Raw event:', rawEvent),
    });

    return () => {
      abortStream();
      markFlowConnectionIdle(flowId);
    };
  },
};
