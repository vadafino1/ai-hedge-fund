import type { DownloadProgress, ModelWithStatus, RecommendedModel } from './ollama-types';

interface BuildOllamaModelListOptions {
  availableModels?: string[];
  recommendedModels: RecommendedModel[];
  activeDownloads: Set<string>;
}

const statusLabels: Record<string, string> = {
  downloading: 'Downloading',
  completed: 'Completed',
  error: 'Failed',
  cancelled: 'Cancelled',
};

export function buildOllamaModelList({
  availableModels = [],
  recommendedModels,
  activeDownloads,
}: BuildOllamaModelListOptions): ModelWithStatus[] {
  const recommendedByName = new Map(
    recommendedModels.map(model => [model.model_name, model]),
  );

  const downloadedModels = [...availableModels].sort().map(modelName => {
    const recommendedModel = recommendedByName.get(modelName);
    return {
      model_name: modelName,
      display_name: recommendedModel?.display_name || modelName,
      provider: 'Ollama',
      isDownloaded: true,
    };
  });

  const downloadableModels = recommendedModels
    .filter(model => !availableModels.includes(model.model_name))
    .filter(model => !activeDownloads.has(model.model_name))
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
    .map(model => ({
      ...model,
      isDownloaded: false,
    }));

  return [...downloadedModels, ...downloadableModels];
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const sizeIndex = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, sizeIndex)).toFixed(2))} ${sizes[sizeIndex]}`;
}

export function isTerminalDownloadStatus(status: string): boolean {
  return status === 'completed' || status === 'error' || status === 'cancelled';
}

export function isTrackableDownloadProgress(progress: DownloadProgress): boolean {
  return progress.status === 'downloading' || progress.status === 'starting';
}

export function getDownloadStatusLabel(status: string): string {
  return statusLabels[status] || status;
}

const statusBadgeClasses: Record<string, string> = {
  downloading: 'bg-blue-600/30 text-primary border-blue-600/40',
  completed: 'bg-green-600/30 text-green-500 border-green-600/40',
  error: 'bg-red-600/30 text-red-500 border-red-600/40',
  cancelled: 'bg-muted text-muted-foreground',
};

export function getDownloadStatusBadgeClass(status: string): string | undefined {
  return statusBadgeClasses[status];
}
