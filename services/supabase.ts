
import { Scenario } from '../types';
import { supabase, isSupabaseConfigured } from './supabaseClient';

const LOCAL_STORAGE_KEY = 'mortgage_pro_scenarios';

// --- Fallback Local Storage Logic (If Supabase not configured) ---
const getLocalScenarios = (): Scenario[] => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error("Local storage error:", e);
    return [];
  }
};

const saveLocal = (scenarios: Scenario[]) => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(scenarios));
};

// --- Real Supabase Logic ---

export const loadScenarios = async (): Promise<{ data: Scenario[], error: any }> => {
    // 1. Fallback if no keys
    if (!isSupabaseConfigured()) {
        const data = getLocalScenarios();
        data.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
        return { data, error: null };
    }

    // 2. Fetch from Cloud
    const { data, error } = await supabase
        .from('scenarios')
        .select('content')
        .order('last_updated', { ascending: false });

    if (error) {
        console.error("Supabase Load Error:", error);
        return { data: [], error };
    }

    // Unwrap the 'content' JSONB column back into Scenario objects
    const scenarios = data.map((row: any) => row.content as Scenario);
    return { data: scenarios, error: null };
};

export const saveScenario = async (scenario: Scenario): Promise<{ error: any }> => {
    // 1. Fallback
    if (!isSupabaseConfigured()) {
        const scenarios = getLocalScenarios();
        const index = scenarios.findIndex(s => s.id === scenario.id);
        if (index >= 0) scenarios[index] = scenario;
        else scenarios.push(scenario);
        saveLocal(scenarios);
        return { error: null };
    }

    // 2. Save to Cloud
    // We map the Scenario object to the Table columns
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return { error: "No user logged in" };

    const { error } = await supabase
        .from('scenarios')
        .upsert({
            id: scenario.id,
            user_id: user.id,
            client_name: scenario.clientName,
            name: scenario.name,
            last_updated: scenario.lastUpdated,
            content: scenario // Store full JSON
        });

    return { error };
};

export const deleteScenario = async (id: string): Promise<{ error: any }> => {
    // 1. Fallback
    if (!isSupabaseConfigured()) {
        const scenarios = getLocalScenarios();
        const filtered = scenarios.filter(s => s.id !== id);
        saveLocal(filtered);
        return { error: null };
    }

    // 2. Delete from Cloud
    const { error } = await supabase
        .from('scenarios')
        .delete()
        .eq('id', id);

    return { error };
};

export const deleteClientFolder = async (clientName: string): Promise<{ error: any }> => {
    // 1. Fallback
    if (!isSupabaseConfigured()) {
        const scenarios = getLocalScenarios();
        const filtered = scenarios.filter(s => s.clientName !== clientName);
        saveLocal(filtered);
        return { error: null };
    }

    // 2. Delete from Cloud
    const { error } = await supabase
        .from('scenarios')
        .delete()
        .eq('client_name', clientName);

    return { error };
};
