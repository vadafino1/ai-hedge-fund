export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  callback: () => void;
  preventDefault?: boolean;
}

interface KeyboardShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  preventDefault?: () => void;
}

function normalizedKey(value: string): string {
  return value.toLowerCase();
}

function shortcutKeyMatches(shortcut: KeyboardShortcut, event: KeyboardShortcutEvent): boolean {
  return normalizedKey(event.key) === normalizedKey(shortcut.key);
}

function modifierMatches(required: boolean | undefined, pressed: boolean): boolean {
  return required ? pressed : !pressed;
}

function primaryModifierRequested(shortcut: KeyboardShortcut): boolean {
  return Boolean(shortcut.ctrlKey || shortcut.metaKey);
}

function primaryModifierPressed(event: KeyboardShortcutEvent): boolean {
  return event.ctrlKey || event.metaKey;
}

function matchesOptionalModifiers(shortcut: KeyboardShortcut, event: KeyboardShortcutEvent): boolean {
  return modifierMatches(shortcut.shiftKey, event.shiftKey) && modifierMatches(shortcut.altKey, event.altKey);
}

function matchesExactModifiers(shortcut: KeyboardShortcut, event: KeyboardShortcutEvent): boolean {
  return modifierMatches(shortcut.ctrlKey, event.ctrlKey)
    && modifierMatches(shortcut.metaKey, event.metaKey)
    && matchesOptionalModifiers(shortcut, event);
}

function isLegacySaveShortcut(shortcut: KeyboardShortcut): boolean {
  return normalizedKey(shortcut.key) === 's' && primaryModifierRequested(shortcut);
}

function matchesLegacySaveShortcut(shortcut: KeyboardShortcut, event: KeyboardShortcutEvent): boolean {
  return isLegacySaveShortcut(shortcut) && primaryModifierPressed(event) && shortcutKeyMatches(shortcut, event);
}

function matchesPrimaryModifierShortcut(shortcut: KeyboardShortcut, event: KeyboardShortcutEvent): boolean {
  return primaryModifierRequested(shortcut)
    && primaryModifierPressed(event)
    && shortcutKeyMatches(shortcut, event)
    && matchesOptionalModifiers(shortcut, event);
}

function matchesKeyboardShortcut(shortcut: KeyboardShortcut, event: KeyboardShortcutEvent): boolean {
  return matchesLegacySaveShortcut(shortcut, event)
    || matchesPrimaryModifierShortcut(shortcut, event)
    || (shortcutKeyMatches(shortcut, event) && matchesExactModifiers(shortcut, event));
}

function shouldPreventDefault(shortcut: KeyboardShortcut): boolean {
  return shortcut.preventDefault ?? true;
}

function maybePreventDefault(shortcut: KeyboardShortcut, event: KeyboardShortcutEvent): void {
  if (shouldPreventDefault(shortcut)) {
    event.preventDefault?.();
  }
}

export function createKeyboardShortcutHandler(shortcuts: KeyboardShortcut[]) {
  return (event: KeyboardShortcutEvent) => {
    shortcuts
      .filter(shortcut => matchesKeyboardShortcut(shortcut, event))
      .forEach(shortcut => {
        maybePreventDefault(shortcut, event);
        shortcut.callback();
      });
  };
}
