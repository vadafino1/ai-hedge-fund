import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import { isTrackableDownloadProgress } from './ollama-models';
import { readDownloadProgressStream } from './ollama-download-stream';
import type { DownloadProgress, OllamaStatus, RecommendedModel } from './ollama-types';

const MAX_STATUS_REFRESH_ATTEMPTS = 5;
const STATUS_REFRESH_DELAY_MS = 2000;
const PROGRESS_CLEANUP_DELAY_MS = 3000;

interface UseOllamaDownloadsOptions {
  ollamaStatus: OllamaStatus | null;
  recommendedModels: RecommendedModel[];
  setOllamaStatus: Dispatch<SetStateAction<OllamaStatus | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
}

function addSetValue<T>(setState: Dispatch<SetStateAction<Set<T>>>, value: T): void {
  setState(prev => {
    if (prev.has(value)) return prev;
    return new Set(prev).add(value);
  });
}

function removeSetValue<T>(setState: Dispatch<SetStateAction<Set<T>>>, value: T): void {
  setState(prev => {
    if (!prev.has(value)) return prev;
    const next = new Set(prev);
    next.delete(value);
    return next;
  });
}

function removeProgress(
  setDownloadProgress: Dispatch<SetStateAction<Record<string, DownloadProgress>>>,
  modelName: string,
): void {
  setDownloadProgress(prev => {
    const next = { ...prev };
    delete next[modelName];
    return next;
  });
}

async function fetchStatus(): Promise<OllamaStatus | null> {
  const response = await fetch('http://localhost:8000/ollama/status');
  return response.ok ? response.json() : null;
}

function canRetryStatusRefresh(attempts: number): boolean {
  return attempts < MAX_STATUS_REFRESH_ATTEMPTS;
}

function scheduleStatusRefresh(
  modelName: string,
  setOllamaStatus: Dispatch<SetStateAction<OllamaStatus | null>>,
  setError: Dispatch<SetStateAction<string | null>>,
  attempts: number,
): void {
  if (!canRetryStatusRefresh(attempts)) return;

  setTimeout(() => {
    void refreshStatusUntilModelAppears(modelName, setOllamaStatus, setError, attempts + 1);
  }, STATUS_REFRESH_DELAY_MS);
}

function updateStatusAndScheduleRetry(
  status: OllamaStatus,
  modelName: string,
  setOllamaStatus: Dispatch<SetStateAction<OllamaStatus | null>>,
  setError: Dispatch<SetStateAction<string | null>>,
  attempts: number,
): void {
  setOllamaStatus(status);
  setError(null);

  if (!status.available_models.includes(modelName)) {
    scheduleStatusRefresh(modelName, setOllamaStatus, setError, attempts);
  }
}

async function refreshStatusUntilModelAppears(
  modelName: string,
  setOllamaStatus: Dispatch<SetStateAction<OllamaStatus | null>>,
  setError: Dispatch<SetStateAction<string | null>>,
  attempts = 0,
): Promise<void> {
  try {
    const status = await fetchStatus();
    if (status) {
      updateStatusAndScheduleRetry(status, modelName, setOllamaStatus, setError, attempts);
      return;
    }

    scheduleStatusRefresh(modelName, setOllamaStatus, setError, attempts);
  } catch (error) {
    console.error('Failed to refresh status:', error);
    scheduleStatusRefresh(modelName, setOllamaStatus, setError, attempts);
  }
}

async function fetchActiveDownloadMap(): Promise<Record<string, DownloadProgress> | null> {
  const response = await fetch('http://localhost:8000/ollama/models/downloads/active');
  return response.ok ? response.json() : null;
}

function readProgressFromMap(
  activeDownloadMap: Record<string, DownloadProgress>,
  modelName: string,
): DownloadProgress | undefined {
  return activeDownloadMap[modelName];
}

async function readPolledProgress(modelName: string): Promise<DownloadProgress | undefined> {
  const activeDownloadMap = await fetchActiveDownloadMap();
  return activeDownloadMap ? readProgressFromMap(activeDownloadMap, modelName) : undefined;
}

function trackActiveDownloadProgress(
  modelName: string,
  progressData: DownloadProgress,
  setActiveDownloads: Dispatch<SetStateAction<Set<string>>>,
  setDownloadProgress: Dispatch<SetStateAction<Record<string, DownloadProgress>>>,
  reconnectToDownload: (modelName: string) => Promise<void>,
): void {
  if (!isTrackableDownloadProgress(progressData)) return;

  addSetValue(setActiveDownloads, modelName);
  setDownloadProgress(prev => ({
    ...prev,
    [modelName]: progressData,
  }));
  void reconnectToDownload(modelName);
}

function trackActiveDownloadMap(
  activeDownloadMap: Record<string, DownloadProgress> | null,
  setActiveDownloads: Dispatch<SetStateAction<Set<string>>>,
  setDownloadProgress: Dispatch<SetStateAction<Record<string, DownloadProgress>>>,
  reconnectToDownload: (modelName: string) => Promise<void>,
): void {
  Object.entries(activeDownloadMap ?? {}).forEach(([modelName, progress]) => {
    trackActiveDownloadProgress(
      modelName,
      progress,
      setActiveDownloads,
      setDownloadProgress,
      reconnectToDownload,
    );
  });
}

async function refreshActiveDownloadTracking(
  setActiveDownloads: Dispatch<SetStateAction<Set<string>>>,
  setDownloadProgress: Dispatch<SetStateAction<Record<string, DownloadProgress>>>,
  reconnectToDownload: (modelName: string) => Promise<void>,
): Promise<void> {
  try {
    const activeDownloadMap = await fetchActiveDownloadMap();
    trackActiveDownloadMap(activeDownloadMap, setActiveDownloads, setDownloadProgress, reconnectToDownload);
  } catch (error) {
    console.debug('No active downloads found or error checking:', error);
  }
}

export function useOllamaDownloads({
  ollamaStatus,
  recommendedModels,
  setOllamaStatus,
  setError,
}: UseOllamaDownloadsOptions) {
  const [downloadProgress, setDownloadProgress] = useState<Record<string, DownloadProgress>>({});
  const [activeDownloads, setActiveDownloads] = useState<Set<string>>(new Set());
  const [pollIntervals, setPollIntervals] = useState<Set<ReturnType<typeof setInterval>>>(new Set());
  const [cancellingDownloads, setCancellingDownloads] = useState<Set<string>>(new Set());

  const completeDownload = useCallback((modelName: string) => {
    removeSetValue(setActiveDownloads, modelName);
    removeProgress(setDownloadProgress, modelName);
    setTimeout(() => {
      void refreshStatusUntilModelAppears(modelName, setOllamaStatus, setError);
    }, STATUS_REFRESH_DELAY_MS);
  }, [setError, setOllamaStatus]);

  const failOrCancelDownload = useCallback((modelName: string, progress: DownloadProgress) => {
    removeSetValue(setActiveDownloads, modelName);
    if (progress.status === 'error') {
      setError(`Download failed for ${modelName}: ${progress.message || progress.error}`);
    }
    setTimeout(() => removeProgress(setDownloadProgress, modelName), PROGRESS_CLEANUP_DELAY_MS);
  }, [setError]);

  const handleProgress = useCallback((modelName: string, progress: DownloadProgress): boolean => {
    setDownloadProgress(prev => ({
      ...prev,
      [modelName]: progress,
    }));

    if (progress.status === 'completed') {
      completeDownload(modelName);
      return false;
    }

    if (progress.status === 'error' || progress.status === 'cancelled') {
      failOrCancelDownload(modelName, progress);
      return false;
    }

    return true;
  }, [completeDownload, failOrCancelDownload]);

  const downloadModelWithProgress = useCallback(async (modelName: string) => {
    setError(null);
    addSetValue(setActiveDownloads, modelName);
    setDownloadProgress(prev => ({
      ...prev,
      [modelName]: { status: 'starting', percentage: 0, message: 'Initializing download...' },
    }));

    try {
      const response = await fetch('http://localhost:8000/ollama/models/download/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_name: modelName }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        setError(`Failed to start download for ${modelName}: ${errorData.detail}`);
        removeSetValue(setActiveDownloads, modelName);
        return;
      }

      await readDownloadProgressStream(response, progress => handleProgress(modelName, progress));
    } catch (error) {
      console.error('Failed to download model with progress:', error);
      setError(`Failed to download ${modelName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      removeSetValue(setActiveDownloads, modelName);
    }
  }, [handleProgress, setError]);

  const performCancelDownload = useCallback(async (modelName: string) => {
    setError(null);
    addSetValue(setCancellingDownloads, modelName);

    try {
      const response = await fetch(`http://localhost:8000/ollama/models/download/${encodeURIComponent(modelName)}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        console.log(`Successfully cancelled download for ${modelName}`);
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        console.warn(`Failed to cancel download for ${modelName}: ${errorData.detail}`);
      }
    } catch (error) {
      console.error('Failed to cancel download:', error);
    }

    removeSetValue(setActiveDownloads, modelName);
    removeProgress(setDownloadProgress, modelName);
    removeSetValue(setCancellingDownloads, modelName);
    console.log(`Cancelled download tracking for ${modelName}`);
  }, [setError]);

  const reconnectToDownload = useCallback(async (modelName: string) => {
    if (activeDownloads.has(modelName)) {
      console.debug(`Already tracking download for ${modelName}`);
      return;
    }

    console.log(`Monitoring existing download for ${modelName}`);

    const pollProgress = async () => {
      try {
        const progress = await readPolledProgress(modelName);
        return progress ? handleProgress(modelName, progress) : false;
      } catch (error) {
        console.error(`Error polling progress for ${modelName}:`, error);
        return false;
      }
    };

    const pollInterval = setInterval(async () => {
      const shouldContinue = await pollProgress();
      if (!shouldContinue) {
        clearInterval(pollInterval);
        removeSetValue(setPollIntervals, pollInterval);
      }
    }, STATUS_REFRESH_DELAY_MS);

    addSetValue(setPollIntervals, pollInterval);

    const shouldContinue = await pollProgress();
    if (!shouldContinue) {
      clearInterval(pollInterval);
      removeSetValue(setPollIntervals, pollInterval);
    }
  }, [activeDownloads, handleProgress]);

  const checkForActiveDownloads = useCallback(async () => {
    if (!ollamaStatus?.running) return;
    await refreshActiveDownloadTracking(setActiveDownloads, setDownloadProgress, reconnectToDownload);
  }, [ollamaStatus?.running, reconnectToDownload]);

  useEffect(() => {
    if (ollamaStatus?.running && recommendedModels.length > 0) {
      void checkForActiveDownloads();
    }
  }, [checkForActiveDownloads, ollamaStatus?.running, recommendedModels.length]);

  useEffect(() => {
    return () => {
      pollIntervals.forEach(interval => clearInterval(interval));
    };
  }, [pollIntervals]);

  return {
    activeDownloads,
    cancellingDownloads,
    downloadProgress,
    downloadModelWithProgress,
    performCancelDownload,
  };
}
