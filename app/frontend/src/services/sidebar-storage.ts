export class SidebarStorageService {
  private static readonly LEFT_SIDEBAR_KEY = 'ai-hedge-fund-left-sidebar-collapsed';
  private static readonly RIGHT_SIDEBAR_KEY = 'ai-hedge-fund-right-sidebar-collapsed';
  private static readonly BOTTOM_PANEL_KEY = 'ai-hedge-fund-bottom-panel-collapsed';

  /**
   * Save left sidebar collapsed state to localStorage
   */
  static saveLeftSidebarState(isCollapsed: boolean): boolean {
    try {
      localStorage.setItem(this.LEFT_SIDEBAR_KEY, JSON.stringify(isCollapsed));
      return true;
    } catch (error) {
      console.error('Failed to save left sidebar state to localStorage:', error);
      return false;
    }
  }

  /**
   * Save right sidebar collapsed state to localStorage
   */
  static saveRightSidebarState(isCollapsed: boolean): boolean {
    try {
      localStorage.setItem(this.RIGHT_SIDEBAR_KEY, JSON.stringify(isCollapsed));
      return true;
    } catch (error) {
      console.error('Failed to save right sidebar state to localStorage:', error);
      return false;
    }
  }

  /**
   * Save bottom panel collapsed state to localStorage
   */
  static saveBottomPanelState(isCollapsed: boolean): boolean {
    try {
      localStorage.setItem(this.BOTTOM_PANEL_KEY, JSON.stringify(isCollapsed));
      return true;
    } catch (error) {
      console.error('Failed to save bottom panel state to localStorage:', error);
      return false;
    }
  }


  /**
   * Load left sidebar collapsed state from localStorage
   */
  static loadLeftSidebarState(defaultValue: boolean = false): boolean {
    try {
      const saved = localStorage.getItem(this.LEFT_SIDEBAR_KEY);
      if (saved === null) {
        return defaultValue;
      }
      
      const parsed = JSON.parse(saved);
      return typeof parsed === 'boolean' ? parsed : defaultValue;
    } catch (error) {
      console.error('Failed to load left sidebar state from localStorage:', error);
      return defaultValue;
    }
  }

  /**
   * Load right sidebar collapsed state from localStorage
   */
  static loadRightSidebarState(defaultValue: boolean = false): boolean {
    try {
      const saved = localStorage.getItem(this.RIGHT_SIDEBAR_KEY);
      if (saved === null) {
        return defaultValue;
      }
      
      const parsed = JSON.parse(saved);
      return typeof parsed === 'boolean' ? parsed : defaultValue;
    } catch (error) {
      console.error('Failed to load right sidebar state from localStorage:', error);
      return defaultValue;
    }
  }

  /**
   * Load bottom panel collapsed state from localStorage
   */
  static loadBottomPanelState(defaultValue: boolean = true): boolean {
    try {
      const saved = localStorage.getItem(this.BOTTOM_PANEL_KEY);
      if (saved === null) {
        return defaultValue;
      }
      
      const parsed = JSON.parse(saved);
      return typeof parsed === 'boolean' ? parsed : defaultValue;
    } catch (error) {
      console.error('Failed to load bottom panel state from localStorage:', error);
      return defaultValue;
    }
  }

} 