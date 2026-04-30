import { useReactFlow } from '@xyflow/react';
import { useCallback, useEffect } from 'react';

import { useFlowContext } from '@/contexts/flow-context';
import { useLayoutContext } from '@/contexts/layout-context';
import { useNodeContext } from '@/contexts/node-context';
import { useFlowConnection } from '@/hooks/use-flow-connection';
import { prepareNodeRunPayload } from '../utils';

export function useStartNodeFlowExecution(nodeId: string) {
  const { currentFlowId } = useFlowContext();
  const { getAllAgentModels } = useNodeContext();
  const { getNodes, getEdges } = useReactFlow();
  const { expandBottomPanel, setBottomPanelTab } = useLayoutContext();

  const flowId = currentFlowId?.toString() || null;
  const {
    isConnecting,
    isConnected,
    isProcessing,
    canRun,
    runFlow,
    runBacktest,
    stopFlow,
    recoverFlowState,
  } = useFlowConnection(flowId);

  useEffect(() => {
    if (flowId) {
      recoverFlowState();
    }
  }, [flowId, recoverFlowState]);

  const openBacktestOutput = useCallback(() => {
    expandBottomPanel();
    setBottomPanelTab('output');
  }, [expandBottomPanel, setBottomPanelTab]);

  const prepareRunPayload = useCallback(() => prepareNodeRunPayload({
    rootNodeId: nodeId,
    nodes: getNodes(),
    edges: getEdges(),
    agentModelsByNodeId: getAllAgentModels(flowId),
  }), [flowId, getAllAgentModels, getEdges, getNodes, nodeId]);

  return {
    canRun,
    runFlow,
    runBacktest,
    stopFlow,
    openBacktestOutput,
    prepareRunPayload,
    showAsProcessing: isConnecting || isConnected || isProcessing,
  };
}
