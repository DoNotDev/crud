// packages/features/crud/src/workflows/WorkflowPersistence.ts

/**
 * @fileoverview Workflow persistence adapter
 * @description Saves and restores workflow progress to/from localStorage.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

/** Persisted workflow state */
export interface PersistedWorkflowState {
  /** Current step index */
  currentStepIndex: number;
  /** Data per step (keyed by step id) */
  stepData: Record<string, Record<string, unknown>>;
  /** Timestamp of last save */
  savedAt: number;
}

const STORAGE_PREFIX = 'dndev-workflow-';

/**
 * Save workflow state to localStorage.
 */
export function saveWorkflowState(
  workflowId: string,
  state: PersistedWorkflowState
): void {
  try {
    const key = `${STORAGE_PREFIX}${workflowId}`;
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // localStorage may be full or unavailable — silently ignore
  }
}

/**
 * Load workflow state from localStorage.
 * Returns null if no saved state exists or parsing fails.
 */
export function loadWorkflowState(
  workflowId: string
): PersistedWorkflowState | null {
  try {
    const key = `${STORAGE_PREFIX}${workflowId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedWorkflowState;
  } catch {
    return null;
  }
}

/**
 * Clear persisted workflow state.
 */
export function clearWorkflowState(workflowId: string): void {
  try {
    const key = `${STORAGE_PREFIX}${workflowId}`;
    localStorage.removeItem(key);
  } catch {
    // Silently ignore
  }
}
