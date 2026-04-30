export interface OllamaStatus {
  installed: boolean;
  running: boolean;
  available_models: string[];
  server_url: string;
  error?: string;
}

export interface RecommendedModel {
  display_name: string;
  model_name: string;
  provider: string;
}

export interface ModelWithStatus extends RecommendedModel {
  isDownloaded: boolean;
}

export interface DownloadProgress {
  status: string;
  percentage?: number;
  message?: string;
  phase?: string;
  bytes_downloaded?: number;
  total_bytes?: number;
  error?: string;
}

export interface ConfirmationState {
  isOpen: boolean;
  modelName: string;
  displayName: string;
}

export function createEmptyConfirmationState(): ConfirmationState {
  return {
    isOpen: false,
    modelName: '',
    displayName: '',
  };
}
