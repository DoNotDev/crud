// packages/features/crud/src/workflows/index.ts

/**
 * @fileoverview Workflow engine exports
 * @description Multi-step entity workflow: defineWorkflow, useEntityWorkflow, persistence.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

export { defineWorkflow } from './defineWorkflow';
export type {
  WorkflowConfig,
  WorkflowStep,
  WorkflowStepContext,
} from './defineWorkflow';

export { useEntityWorkflow } from './useEntityWorkflow';
export type {
  UseEntityWorkflowOptions,
  EntityWorkflowReturn,
} from './useEntityWorkflow';

export {
  saveWorkflowState,
  loadWorkflowState,
  clearWorkflowState,
} from './WorkflowPersistence';
export type { PersistedWorkflowState } from './WorkflowPersistence';
