import { type Edge, type Node } from '@xyflow/react';

import { type LanguageModel } from '../data/models';
import { type AgentModelConfig, type GraphEdge, type GraphNode } from '../services/types';

type NodeStatus = 'IDLE' | 'IN_PROGRESS' | 'COMPLETE' | 'ERROR';

type RunnableNode = Pick<Node, 'id' | 'type' | 'data' | 'position'>;
type RunnableEdge = Pick<Edge, 'id' | 'source' | 'target' | 'type' | 'data'>;

interface PrepareNodeRunPayloadParams {
  rootNodeId: string;
  nodes: RunnableNode[];
  edges: RunnableEdge[];
  agentModelsByNodeId: Record<string, LanguageModel | null>;
}

interface PreparedNodeRunPayload {
  graph_nodes: GraphNode[];
  graph_edges: GraphEdge[];
  agent_models: AgentModelConfig[];
}

/**
 * Returns the appropriate background color class based on node status
 */
export function getStatusColor(status: NodeStatus): string {
  switch (status) {
    case 'IN_PROGRESS':
      return 'bg-amber-500  dark:bg-amber-80';
    case 'ERROR':
      return 'bg-red-500 dark:bg-red-800';
    default:
      return 'bg-node';
  }
}

/**
 * Builds the graph payload shared by start-node run buttons.
 * The root node starts the run and is intentionally excluded from graph_nodes,
 * while its outgoing edges remain in graph_edges so the backend can see the
 * complete executable subgraph boundary.
 */
export function prepareNodeRunPayload({
  rootNodeId,
  nodes,
  edges,
  agentModelsByNodeId,
}: PrepareNodeRunPayloadParams): PreparedNodeRunPayload {
  const outgoingEdgesBySource = groupOutgoingEdgesBySource(edges);
  const reachableNodeIds = collectReachableNodeIds(rootNodeId, outgoingEdgesBySource);

  const runNodeIds = new Set<string>();
  runNodeIds.add(rootNodeId);
  reachableNodeIds.forEach(nodeId => runNodeIds.add(nodeId));
  const graphNodes = nodes
    .filter(node => reachableNodeIds.has(node.id))
    .map(({ id, type, data, position }) => ({ id, type, data, position }));
  const graphEdges = edges
    .filter(edge => runNodeIds.has(edge.source) && runNodeIds.has(edge.target))
    .map(({ id, source, target, type, data }) => ({ id, source, target, type, data }));
  const agentModels = graphNodes.flatMap(({ id }) => {
    const model = agentModelsByNodeId[id];

    if (!model) {
      return [];
    }

    return [{
      agent_id: id,
      model_name: model.model_name,
      model_provider: model.provider as AgentModelConfig['model_provider'],
    }];
  });

  return {
    graph_nodes: graphNodes,
    graph_edges: graphEdges,
    agent_models: agentModels,
  };
}

function groupOutgoingEdgesBySource(edges: RunnableEdge[]): Map<string, RunnableEdge[]> {
  const groupedEdges = new Map<string, RunnableEdge[]>();

  for (const edge of edges) {
    groupedEdges.set(edge.source, [...(groupedEdges.get(edge.source) ?? []), edge]);
  }

  return groupedEdges;
}

function collectReachableNodeIds(
  rootNodeId: string,
  outgoingEdgesBySource: Map<string, RunnableEdge[]>,
): Set<string> {
  const reachableNodeIds = new Set<string>();
  const visitedNodeIds = new Set<string>([rootNodeId]);
  const pendingNodeIds = getOutgoingTargets(rootNodeId, outgoingEdgesBySource);

  for (const nodeId of pendingNodeIds) {
    if (visitedNodeIds.has(nodeId)) {
      continue;
    }

    visitedNodeIds.add(nodeId);
    reachableNodeIds.add(nodeId);
    pendingNodeIds.push(...getOutgoingTargets(nodeId, outgoingEdgesBySource));
  }

  return reachableNodeIds;
}

function getOutgoingTargets(
  nodeId: string,
  outgoingEdgesBySource: Map<string, RunnableEdge[]>,
): string[] {
  return (outgoingEdgesBySource.get(nodeId) ?? []).map(edge => edge.target);
}
