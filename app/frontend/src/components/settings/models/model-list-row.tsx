import type { ReactNode } from 'react';

interface ModelListRowProps {
  action: ReactNode;
  displayName: string;
  modelName: string;
}

export function ModelListRow({ action, displayName, modelName }: ModelListRowProps) {
  return (
    <div className="group flex items-center justify-between bg-muted hover-bg rounded-md px-3 py-2.5 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate text-primary">{displayName}</span>
          {modelName !== displayName && (
            <span className="font-mono text-xs text-muted-foreground">{modelName}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">{action}</div>
    </div>
  );
}
