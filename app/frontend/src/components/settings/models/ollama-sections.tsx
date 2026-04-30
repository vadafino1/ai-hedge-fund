import { AlertTriangle, Brain, CheckCircle, Download, Play, RefreshCw, Server, Square, Trash2, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import {
  formatBytes,
  getDownloadStatusBadgeClass,
  getDownloadStatusLabel,
  isTerminalDownloadStatus,
} from './ollama-models';
import { ModelListRow } from './model-list-row';
import type { ConfirmationState, DownloadProgress, ModelWithStatus, OllamaStatus, RecommendedModel } from './ollama-types';

interface HeaderProps {
  loading: boolean;
  ollamaStatus: OllamaStatus | null;
  onRefresh: () => void;
}

interface ServerPanelProps {
  actionLoading: string | null;
  ollamaStatus: OllamaStatus | null;
  onStartServer: () => void;
  onStopServer: () => void;
}

interface ModelsSectionProps {
  actionLoading: string | null;
  activeDownloads: Set<string>;
  cancellingDownloads: Set<string>;
  downloadProgress: Record<string, DownloadProgress>;
  models: ModelWithStatus[];
  ollamaStatus: OllamaStatus;
  recommendedModels: RecommendedModel[];
  onCancelDownload: (modelName: string) => void;
  onDeleteModel: (model: ModelWithStatus) => void;
  onDownloadModel: (modelName: string) => void;
}

interface ConfirmationDialogsProps {
  actionLoading: string | null;
  cancelConfirmation: ConfirmationState;
  cancellingDownloads: Set<string>;
  deleteConfirmation: ConfirmationState;
  onCancelCancelDownload: () => void;
  onCancelDeleteModel: () => void;
  onConfirmCancelDownload: () => void;
  onConfirmDeleteModel: () => void;
}

function getStatusIcon(ollamaStatus: OllamaStatus | null) {
  if (!ollamaStatus) return <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (!ollamaStatus.installed) return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
  if (!ollamaStatus.running) return <Server className="h-4 w-4 text-muted-foreground" />;
  return <CheckCircle className="h-4 w-4 text-muted-foreground" />;
}

function getStatusText(ollamaStatus: OllamaStatus | null): string {
  if (!ollamaStatus) return 'Checking...';
  if (!ollamaStatus.installed) return 'Not Installed';
  if (!ollamaStatus.running) return 'Not Running';
  return 'Running';
}

function getModelDisplayName(recommendedModels: RecommendedModel[], modelName: string): string {
  return recommendedModels.find(model => model.model_name === modelName)?.display_name || modelName;
}

export function OllamaHeader({ loading, ollamaStatus, onRefresh }: HeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-lg font-semibold text-primary mb-2">Ollama</h3>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground">
          Manage local AI models with Ollama for enhanced privacy and performance.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="flex items-center gap-1">
          {getStatusIcon(ollamaStatus)}
          {getStatusText(ollamaStatus)}
        </Badge>
        <Button
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          className="text-primary hover:bg-primary/20 hover:text-primary bg-primary/10 border-primary/30 hover:border-primary/50"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </Button>
      </div>
    </div>
  );
}

export function OllamaErrorAlert({ error }: { error: string }) {
  return (
    <div className="bg-red-900/20 border border-red-600/30 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5" />
        <div>
          <h4 className="font-medium text-red-300">Error</h4>
          <p className="text-sm text-red-400 mt-1">{error}</p>
        </div>
      </div>
    </div>
  );
}

export function OllamaInstallNotice() {
  return (
    <div className="bg-muted rounded-lg p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-muted-foreground mt-0.5" />
        <div>
          <h4 className="font-medium text-muted-foreground">Ollama Not Installed</h4>
          <p className="text-sm text-muted-foreground mt-1">
            Install Ollama to use local AI models. Visit{' '}
            <a
              href="https://ollama.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline text-muted-foreground"
            >
              ollama.com
            </a>{' '}
            to download and install.
          </p>
        </div>
      </div>
    </div>
  );
}

function OllamaStoppedServerPanel({ actionLoading, onStartServer }: Pick<ServerPanelProps, 'actionLoading' | 'onStartServer'>) {
  return (
    <div className="flex items-center justify-between bg-muted rounded-lg p-4">
      <div>
        <h4 className="font-medium text-primary">Ollama Server</h4>
        <p className="text-sm text-primary">Ollama is installed but not currently running.</p>
      </div>
      <Button
        onClick={onStartServer}
        disabled={actionLoading === 'start-server'}
        className="flex items-center gap-2 text-primary hover:bg-primary/20 hover:text-primary bg-primary/10 border-primary/30 hover:border-primary/50"
      >
        <Play className="h-4 w-4" />
        {actionLoading === 'start-server' ? 'Starting...' : 'Start Server'}
      </Button>
    </div>
  );
}

function OllamaRunningServerPanel({
  actionLoading,
  ollamaStatus,
  onStopServer,
}: Pick<ServerPanelProps, 'actionLoading' | 'ollamaStatus' | 'onStopServer'>) {
  return (
    <div className="flex items-center justify-between bg-muted rounded-lg p-4">
      <div className="flex items-center gap-2">
        <CheckCircle className="h-5 w-5 text-primary" />
        <div>
          <span className="font-medium text-primary">Ollama Server Running</span>
          <p className="text-sm text-muted-foreground">Server available at {ollamaStatus?.server_url}</p>
        </div>
      </div>
      <Button
        onClick={onStopServer}
        disabled={actionLoading === 'stop-server'}
        className="flex items-center gap-2 text-red-400 hover:bg-red-500/20 hover:text-red-300 bg-red-500/10 border-red-500/30 hover:border-red-500/50"
      >
        <Square className="h-4 w-4" />
        {actionLoading === 'stop-server' ? 'Stopping...' : 'Disconnect'}
      </Button>
    </div>
  );
}

const serverPanelStateByStatus: Record<string, 'stopped' | 'running' | null> = {
  'false:false': null,
  'false:true': 'running',
  'true:false': 'stopped',
  'true:true': 'running',
};

function getServerPanelState(ollamaStatus: OllamaStatus | null): 'stopped' | 'running' | null {
  const installed = Boolean(ollamaStatus && ollamaStatus.installed);
  const running = Boolean(ollamaStatus && ollamaStatus.running);
  return serverPanelStateByStatus[`${installed}:${running}`];
}

export function OllamaServerPanel({ actionLoading, ollamaStatus, onStartServer, onStopServer }: ServerPanelProps) {
  const panelState = getServerPanelState(ollamaStatus);
  const panels = {
    stopped: <OllamaStoppedServerPanel actionLoading={actionLoading} onStartServer={onStartServer} />,
    running: (
      <OllamaRunningServerPanel
        actionLoading={actionLoading}
        ollamaStatus={ollamaStatus}
        onStopServer={onStopServer}
      />
    ),
  };

  return panelState ? panels[panelState] : null;
}

function DownloadStatusBadge({ status }: { status: string }) {
  return (
    <Badge className={cn('text-xs border', getDownloadStatusBadgeClass(status))}>
      {getDownloadStatusLabel(status)}
    </Badge>
  );
}

function CancelDownloadButton({
  isCancelling,
  modelName,
  onCancel,
  status,
}: {
  isCancelling: boolean;
  modelName: string;
  onCancel: (modelName: string) => void;
  status: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onCancel(modelName)}
      disabled={isCancelling || isTerminalDownloadStatus(status)}
      className="text-muted-foreground hover:text-primary h-6 w-6 p-0"
    >
      {isCancelling ? <RefreshCw className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
    </Button>
  );
}

function ProgressBytes({ progress }: { progress: DownloadProgress }) {
  if (!progress.bytes_downloaded || !progress.total_bytes) return null;

  return (
    <div className="text-xs text-muted-foreground">
      {formatBytes(progress.bytes_downloaded)} / {formatBytes(progress.total_bytes)}
    </div>
  );
}

function ProgressMessage({ message }: { message?: string }) {
  return message ? <div className="text-xs text-muted-foreground truncate">{message}</div> : null;
}

function ProgressBar({ progress }: { progress: DownloadProgress }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{progress.phase || progress.status}</span>
        <span>{progress.percentage ? `${progress.percentage.toFixed(1)}%` : '...'}</span>
      </div>
      <div className="w-full bg-muted rounded-full h-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress.percentage || 0}%` }}
        />
      </div>
      <ProgressBytes progress={progress} />
      <ProgressMessage message={progress.message} />
    </div>
  );
}

function DownloadProgressCard({
  displayName,
  isCancelling,
  modelName,
  onCancel,
  progress,
}: {
  displayName: string;
  isCancelling: boolean;
  modelName: string;
  onCancel: (modelName: string) => void;
  progress: DownloadProgress;
}) {
  return (
    <div className="bg-muted rounded-md px-3 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-primary">{displayName}</span>
          <DownloadStatusBadge status={progress.status} />
        </div>
        <CancelDownloadButton
          isCancelling={isCancelling}
          modelName={modelName}
          onCancel={onCancel}
          status={progress.status}
        />
      </div>
      <ProgressBar progress={progress} />
    </div>
  );
}

function DeleteModelButton({
  actionLoading,
  model,
  onDeleteModel,
}: {
  actionLoading: string | null;
  model: ModelWithStatus;
  onDeleteModel: (model: ModelWithStatus) => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onDeleteModel(model)}
      disabled={actionLoading === `delete-${model.model_name}`}
      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary h-6 w-6 p-0"
    >
      <Trash2 className="h-3 w-3" />
    </Button>
  );
}

function DownloadModelButton({ modelName, onDownloadModel }: { modelName: string; onDownloadModel: (modelName: string) => void }) {
  return (
    <Button
      size="sm"
      onClick={() => onDownloadModel(modelName)}
      className="flex items-center gap-2 h-7 text-primary hover:bg-primary/20 hover:text-primary bg-primary/10 border-primary/30 hover:border-primary/50"
    >
      <Download className="h-3 w-3" />
      Download
    </Button>
  );
}

function OllamaModelAction({
  actionLoading,
  activeDownloads,
  model,
  onDeleteModel,
  onDownloadModel,
}: {
  actionLoading: string | null;
  activeDownloads: Set<string>;
  model: ModelWithStatus;
  onDeleteModel: (model: ModelWithStatus) => void;
  onDownloadModel: (modelName: string) => void;
}) {
  if (model.isDownloaded) {
    return <DeleteModelButton actionLoading={actionLoading} model={model} onDeleteModel={onDeleteModel} />;
  }

  if (activeDownloads.has(model.model_name)) return null;

  return <DownloadModelButton modelName={model.model_name} onDownloadModel={onDownloadModel} />;
}

function OllamaModelRow({
  actionLoading,
  activeDownloads,
  model,
  onDeleteModel,
  onDownloadModel,
}: {
  actionLoading: string | null;
  activeDownloads: Set<string>;
  model: ModelWithStatus;
  onDeleteModel: (model: ModelWithStatus) => void;
  onDownloadModel: (modelName: string) => void;
}) {
  return (
    <ModelListRow
      displayName={model.display_name}
      modelName={model.model_name}
      action={(
        <OllamaModelAction
          actionLoading={actionLoading}
          activeDownloads={activeDownloads}
          model={model}
          onDeleteModel={onDeleteModel}
          onDownloadModel={onDownloadModel}
        />
      )}
    />
  );
}

export function OllamaModelsSection({
  actionLoading,
  activeDownloads,
  cancellingDownloads,
  downloadProgress,
  models,
  ollamaStatus,
  recommendedModels,
  onCancelDownload,
  onDeleteModel,
  onDownloadModel,
}: ModelsSectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-primary">Available Models</h3>
        <span className="text-xs text-muted-foreground">{ollamaStatus.available_models.length} downloaded</span>
      </div>

      {Object.entries(downloadProgress).map(([modelName, progress]) => (
        <DownloadProgressCard
          key={`download-${modelName}`}
          displayName={getModelDisplayName(recommendedModels, modelName)}
          isCancelling={cancellingDownloads.has(modelName)}
          modelName={modelName}
          onCancel={onCancelDownload}
          progress={progress}
        />
      ))}

      {models.length > 0 ? (
        <div className="space-y-1">
          {models.map(model => (
            <OllamaModelRow
              key={model.model_name}
              actionLoading={actionLoading}
              activeDownloads={activeDownloads}
              model={model}
              onDeleteModel={onDeleteModel}
              onDownloadModel={onDownloadModel}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No models available</p>
        </div>
      )}
    </div>
  );
}

export function OllamaConfirmationDialogs({
  actionLoading,
  cancelConfirmation,
  cancellingDownloads,
  deleteConfirmation,
  onCancelCancelDownload,
  onCancelDeleteModel,
  onConfirmCancelDownload,
  onConfirmDeleteModel,
}: ConfirmationDialogsProps) {
  return (
    <>
      <Dialog open={deleteConfirmation.isOpen} onOpenChange={open => !open && onCancelDeleteModel()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              Delete Model
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteConfirmation.displayName}</strong>?
              <br />
              <span className="text-sm text-muted-foreground mt-1 block">
                Model: {deleteConfirmation.modelName}
              </span>
              <br />
              This action cannot be undone. You will need to download the model again to use it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={onCancelDeleteModel}
              disabled={actionLoading === `delete-${deleteConfirmation.modelName}`}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirmDeleteModel}
              disabled={actionLoading === `delete-${deleteConfirmation.modelName}`}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {actionLoading === `delete-${deleteConfirmation.modelName}` ? 'Deleting...' : 'Delete Model'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelConfirmation.isOpen} onOpenChange={open => !open && onCancelCancelDownload()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Cancel Download
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel the download of <strong>{cancelConfirmation.displayName}</strong>?
              <br />
              <span className="text-sm text-muted-foreground mt-1 block">
                Model: {cancelConfirmation.modelName}
              </span>
              <br />
              Any progress will be lost and you'll need to start the download again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={onCancelCancelDownload}
              disabled={cancellingDownloads.has(cancelConfirmation.modelName)}
            >
              Continue Download
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirmCancelDownload}
              disabled={cancellingDownloads.has(cancelConfirmation.modelName)}
              className="flex items-center gap-2"
            >
              <X className="h-4 w-4" />
              {cancellingDownloads.has(cancelConfirmation.modelName) ? 'Cancelling...' : 'Cancel Download'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
