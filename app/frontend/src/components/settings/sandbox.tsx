import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import { ExecutionMode, SandboxStatus } from '@/services/types';
import { getStoredExecutionMode, setStoredExecutionMode } from '@/services/execution-mode';

export function SandboxSettings() {
  const [status, setStatus] = useState<SandboxStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ExecutionMode>(getStoredExecutionMode());

  const refreshStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await api.getSandboxStatus());
    } catch (err: any) {
      setError(err?.message || 'Failed to load sandbox status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  const updateMode = (nextMode: ExecutionMode) => {
    setMode(nextMode);
    setStoredExecutionMode(nextMode);
  };

  const sandboxUnavailable = !status?.available;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-primary">Execution Sandbox</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose whether runs execute in the backend process or in an isolated local Docker container.
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-primary">Docker sandbox status</h3>
            <p className="text-sm text-muted-foreground">{status?.message || error || 'Status not loaded'}</p>
          </div>
          <button onClick={refreshStatus} disabled={loading} className="px-3 py-2 rounded-md border text-sm hover-item">
            {loading ? 'Checking...' : 'Refresh'}
          </button>
        </div>

        {status && (
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt>Docker installed</dt><dd>{status.docker_installed ? 'Yes' : 'No'}</dd>
            <dt>Docker running</dt><dd>{status.docker_running ? 'Yes' : 'No'}</dd>
            <dt>Image available</dt><dd>{status.image_available ? 'Yes' : 'No'}</dd>
            <dt>Image</dt><dd>{status.image_name}</dd>
          </dl>
        )}
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="font-medium text-primary">Execution mode</h3>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={mode === 'local'} onChange={() => updateMode('local')} />
          Local process
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={mode === 'docker_sandbox'} disabled={sandboxUnavailable} onChange={() => updateMode('docker_sandbox')} />
          Docker sandbox
        </label>
        {sandboxUnavailable && (
          <p className="text-sm text-yellow-600">Docker sandbox is unavailable: {status?.message || error || 'unknown status'}.</p>
        )}
      </div>
    </div>
  );
}
