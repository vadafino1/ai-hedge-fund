const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface Agent {
  key: string;
  display_name: string;
  description: string;
  investing_style: string;
  order: number;
}

// In-memory cache for agents to avoid repeated API calls
let agents: Agent[] | null = null;

/**
 * Get the list of agents from the backend API
 * Uses caching to avoid repeated API calls
 */
export const getAgents = async (): Promise<Agent[]> => {
  if (agents) {
    return agents;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/hedge-fund/agents`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const fetchedAgents = data.agents as Agent[];
    agents = fetchedAgents;
    return fetchedAgents;
  } catch (error) {
    console.error('Failed to fetch agents:', error);
    throw error; // Let the calling component handle the error
  }
};
