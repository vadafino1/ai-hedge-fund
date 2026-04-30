type FlowConnectionState = 'idle' | 'connecting' | 'connected' | 'error' | 'completed';

interface FlowConnectionInfo {
  state: FlowConnectionState;
  abortController: (() => void) | null;
  startTime: number;
  lastActivity: number;
  error?: string;
}

class FlowConnectionManager {
  private connections = new Map<string, FlowConnectionInfo>();
  private listeners = new Set<() => void>();

  getConnection(flowId: string): FlowConnectionInfo {
    return this.connections.get(flowId) || {
      state: 'idle',
      abortController: null,
      startTime: 0,
      lastActivity: 0,
    };
  }

  setConnection(flowId: string, info: Partial<FlowConnectionInfo>): void {
    const existing = this.getConnection(flowId);
    const updated = {
      ...existing,
      ...info,
      lastActivity: Date.now(),
    };

    this.connections.set(flowId, updated);
    this.notifyListeners();
  }

  removeConnection(flowId: string): void {
    const connection = this.connections.get(flowId);
    if (connection?.abortController) {
      connection.abortController();
    }
    this.connections.delete(flowId);
    this.notifyListeners();
  }

  addListener(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.removeListener(listener);
  }

  removeListener(listener: () => void): void {
    this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }
}

export const flowConnectionManager = new FlowConnectionManager();

function resetCompletedFlowConnectionAfterDelay(flowId: string | null): void {
  if (!flowId) return;

  setTimeout(() => {
    const currentConnection = flowConnectionManager.getConnection(flowId);
    if (currentConnection.state === 'completed') {
      flowConnectionManager.setConnection(flowId, {
        state: 'idle',
      });
    }
  }, 30000);
}

export function completeFlowConnectionIfStillConnected(flowId: string | null): void {
  if (!flowId) return;

  const currentConnection = flowConnectionManager.getConnection(flowId);
  if (currentConnection.state === 'connected') {
    flowConnectionManager.setConnection(flowId, {
      state: 'completed',
      abortController: null,
    });
  }
}

export function markFlowConnectionCompleted(flowId: string | null): void {
  if (!flowId) return;

  flowConnectionManager.setConnection(flowId, {
    state: 'completed',
    abortController: null,
  });
  resetCompletedFlowConnectionAfterDelay(flowId);
}

export function markFlowConnectionError(flowId: string | null, message: string): void {
  if (!flowId) return;

  flowConnectionManager.setConnection(flowId, {
    state: 'error',
    error: message,
    abortController: null,
  });
}

export function markFlowConnectionIdle(flowId: string | null): void {
  if (!flowId) return;

  flowConnectionManager.setConnection(flowId, {
    state: 'idle',
    abortController: null,
  });
}
