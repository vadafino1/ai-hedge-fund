import { useCallback, useEffect, useState } from 'react';

import { buildOllamaModelList } from './ollama-models';
import {
  OllamaConfirmationDialogs,
  OllamaErrorAlert,
  OllamaHeader,
  OllamaInstallNotice,
  OllamaModelsSection,
  OllamaServerPanel,
} from './ollama-sections';
import { createEmptyConfirmationState, type ConfirmationState, type ModelWithStatus, type OllamaStatus, type RecommendedModel } from './ollama-types';
import { useOllamaDownloads } from './use-ollama-downloads';

async function readErrorDetail(response: Response): Promise<string> {
  const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
  return errorData.detail;
}

export function OllamaSettings() {
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [recommendedModels, setRecommendedModels] = useState<RecommendedModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<ConfirmationState>(createEmptyConfirmationState());
  const [cancelConfirmation, setCancelConfirmation] = useState<ConfirmationState>(createEmptyConfirmationState());

  const {
    activeDownloads,
    cancellingDownloads,
    downloadProgress,
    downloadModelWithProgress,
    performCancelDownload,
  } = useOllamaDownloads({
    ollamaStatus,
    recommendedModels,
    setOllamaStatus,
    setError,
  });

  const fetchOllamaStatus = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8000/ollama/status');
      if (response.ok) {
        const status = await response.json();
        setOllamaStatus(status);
        setError(null);
        return;
      }

      setError(`Failed to get status: ${await readErrorDetail(response)}`);
    } catch (error) {
      console.error('Failed to fetch Ollama status:', error);
      setError('Failed to connect to backend service');
    }
  }, []);

  const fetchRecommendedModels = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8000/ollama/models/recommended');
      if (response.ok) {
        const models = await response.json();
        setRecommendedModels(models);
      } else {
        console.error('Failed to fetch recommended models');
      }
    } catch (error) {
      console.error('Failed to fetch recommended models:', error);
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([fetchOllamaStatus(), fetchRecommendedModels()]);
    setLoading(false);
  }, [fetchOllamaStatus, fetchRecommendedModels]);

  const runServerAction = async (action: 'start' | 'stop') => {
    const loadingKey = `${action}-server`;
    setActionLoading(loadingKey);
    setError(null);

    try {
      const response = await fetch(`http://localhost:8000/ollama/${action}`, { method: 'POST' });
      if (response.ok) {
        await fetchOllamaStatus();
      } else {
        setError(`Failed to ${action} server: ${await readErrorDetail(response)}`);
      }
    } catch (error) {
      console.error(`Failed to ${action} Ollama server:`, error);
      setError(`Failed to ${action} Ollama server`);
    }

    setActionLoading(null);
  };

  const deleteModel = async (modelName: string) => {
    setActionLoading(`delete-${modelName}`);
    setError(null);

    try {
      const response = await fetch(`http://localhost:8000/ollama/models/${encodeURIComponent(modelName)}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        await fetchOllamaStatus();
      } else {
        setError(`Failed to delete ${modelName}: ${await readErrorDetail(response)}`);
      }
    } catch (error) {
      console.error('Failed to delete model:', error);
      setError(`Failed to delete ${modelName}`);
    }

    setActionLoading(null);
  };

  const showDeleteConfirmation = (model: ModelWithStatus) => {
    setDeleteConfirmation({
      isOpen: true,
      modelName: model.model_name,
      displayName: model.display_name,
    });
  };

  const showCancelConfirmation = (modelName: string) => {
    const displayName = recommendedModels.find(model => model.model_name === modelName)?.display_name || modelName;
    setCancelConfirmation({
      isOpen: true,
      modelName,
      displayName,
    });
  };

  const closeDeleteConfirmation = () => setDeleteConfirmation(createEmptyConfirmationState());
  const closeCancelConfirmation = () => setCancelConfirmation(createEmptyConfirmationState());

  const confirmDeleteModel = async () => {
    const { modelName } = deleteConfirmation;
    closeDeleteConfirmation();
    await deleteModel(modelName);
  };

  const confirmCancelDownload = async () => {
    const { modelName } = cancelConfirmation;
    closeCancelConfirmation();
    await performCancelDownload(modelName);
  };

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const allModels = buildOllamaModelList({
    availableModels: ollamaStatus?.available_models,
    recommendedModels,
    activeDownloads,
  });

  return (
    <div className="space-y-6">
      <OllamaHeader loading={loading} ollamaStatus={ollamaStatus} onRefresh={refreshStatus} />

      {error && <OllamaErrorAlert error={error} />}
      {!ollamaStatus?.installed && <OllamaInstallNotice />}

      <OllamaServerPanel
        actionLoading={actionLoading}
        ollamaStatus={ollamaStatus}
        onStartServer={() => void runServerAction('start')}
        onStopServer={() => void runServerAction('stop')}
      />

      {ollamaStatus?.running && (
        <OllamaModelsSection
          actionLoading={actionLoading}
          activeDownloads={activeDownloads}
          cancellingDownloads={cancellingDownloads}
          downloadProgress={downloadProgress}
          models={allModels}
          ollamaStatus={ollamaStatus}
          recommendedModels={recommendedModels}
          onCancelDownload={showCancelConfirmation}
          onDeleteModel={showDeleteConfirmation}
          onDownloadModel={modelName => void downloadModelWithProgress(modelName)}
        />
      )}

      <OllamaConfirmationDialogs
        actionLoading={actionLoading}
        cancelConfirmation={cancelConfirmation}
        cancellingDownloads={cancellingDownloads}
        deleteConfirmation={deleteConfirmation}
        onCancelCancelDownload={closeCancelConfirmation}
        onCancelDeleteModel={closeDeleteConfirmation}
        onConfirmCancelDownload={() => void confirmCancelDownload()}
        onConfirmDeleteModel={() => void confirmDeleteModel()}
      />
    </div>
  );
}
