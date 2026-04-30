import { useEffect } from 'react';

import { createKeyboardShortcutHandler, type KeyboardShortcut } from './keyboard-shortcut-matcher';

interface UseKeyboardShortcutsProps {
  shortcuts: KeyboardShortcut[];
}

export function useKeyboardShortcuts({ shortcuts }: UseKeyboardShortcutsProps) {
  useEffect(() => {
    const handleKeyDown = createKeyboardShortcutHandler(shortcuts);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts]);
}

// Convenience hook specifically for common shortcuts
export function useFlowKeyboardShortcuts(saveFlow: (showToast?: boolean) => void) {
  const shortcuts: KeyboardShortcut[] = [
    {
      key: 's',
      ctrlKey: true, // This will match either Ctrl+S or Cmd+S due to our logic above
      metaKey: true,
      callback: () => saveFlow(true),
      preventDefault: true,
    },
  ];

  useKeyboardShortcuts({ shortcuts });
}

function addShortcut(shortcuts: KeyboardShortcut[], shortcut: KeyboardShortcut, enabled: boolean): void {
  if (enabled) {
    shortcuts.push(shortcut);
  }
}

// Convenience hook for layout keyboard shortcuts
export function useLayoutKeyboardShortcuts(
  toggleRightSidebar: () => void,
  toggleLeftSidebar?: () => void,
  fitView?: () => void,
  undo?: () => void,
  redo?: () => void,
  toggleBottomPanel?: () => void,
  openSettings?: () => void
) {
  const shortcuts: KeyboardShortcut[] = [
    {
      key: 'i',
      ctrlKey: true, // This will match either Ctrl+I or Cmd+I due to our logic above
      metaKey: true,
      callback: toggleRightSidebar,
      preventDefault: true,
    },
  ];

  addShortcut(shortcuts, {
    key: 'b',
    ctrlKey: true, // This will match either Ctrl+B or Cmd+B
    metaKey: true,
    callback: toggleLeftSidebar ?? (() => undefined),
    preventDefault: true,
  }, Boolean(toggleLeftSidebar));

  addShortcut(shortcuts, {
    key: '0',
    ctrlKey: true, // This will match either Ctrl+0 or Cmd+0
    metaKey: true,
    callback: fitView ?? (() => undefined),
    preventDefault: true,
  }, Boolean(fitView));

  addShortcut(shortcuts, {
    key: 'z',
    ctrlKey: true, // This will match either Ctrl+Z or Cmd+Z
    metaKey: true,
    callback: undo ?? (() => undefined),
    preventDefault: true,
  }, Boolean(undo));

  addShortcut(shortcuts, {
    key: 'z',
    ctrlKey: true, // This will match either Ctrl+Shift+Z or Cmd+Shift+Z
    metaKey: true,
    shiftKey: true,
    callback: redo ?? (() => undefined),
    preventDefault: true,
  }, Boolean(redo));

  addShortcut(shortcuts, {
    key: 'j',
    ctrlKey: true, // This will match either Ctrl+J or Cmd+J (like VSCode)
    metaKey: true,
    callback: toggleBottomPanel ?? (() => undefined),
    preventDefault: true,
  }, Boolean(toggleBottomPanel));

  if (openSettings) {
    shortcuts.push(
      {
        key: 'j',
        ctrlKey: true, // This will match either Ctrl+Shift+J or Cmd+Shift+J
        metaKey: true,
        shiftKey: true,
        callback: openSettings,
        preventDefault: true,
      },
      {
        key: ',',
        ctrlKey: true, // This will match either Ctrl+, or Cmd+,
        metaKey: true,
        callback: openSettings,
        preventDefault: true,
      },
    );
  }

  useKeyboardShortcuts({ shortcuts });
}
