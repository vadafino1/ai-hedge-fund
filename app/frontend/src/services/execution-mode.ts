import { ExecutionMode } from '@/services/types';

const STORAGE_KEY = 'ai-hedge-fund-execution-mode';

export const getStoredExecutionMode = (): ExecutionMode => {
  if (typeof window === 'undefined') return 'local';
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === 'docker_sandbox' ? 'docker_sandbox' : 'local';
};

export const setStoredExecutionMode = (mode: ExecutionMode): void => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, mode);
  }
};
