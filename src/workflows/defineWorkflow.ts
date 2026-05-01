// packages/features/crud/src/workflows/defineWorkflow.ts

/**
 * @fileoverview defineWorkflow utility
 * @description Creates a type-safe workflow configuration for multi-step entity forms.
 *
 * @example
 * ```typescript
 * import { defineWorkflow } from '@donotdev/crud';
 * import { companyEntity, contactEntity } from './entities';
 *
 * const onboarding = defineWorkflow({
 *   id: 'customer-onboarding',
 *   name: 'Customer Onboarding',
 *   persist: true,
 *   steps: [
 *     { id: 'company', title: 'Company Info', entity: companyEntity, fields: ['name', 'industry'] },
 *     { id: 'contact', title: 'Primary Contact', entity: contactEntity, fields: ['firstName', 'email'] },
 *   ],
 * });
 * ```
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import type { AnyEntity } from '@donotdev/core';
import type { ConditionInput, ConditionalBehavior } from '@donotdev/core';

import type { ReactNode } from 'react';

/** Configuration for a single workflow step */
export interface WorkflowStep {
  /** Unique step identifier */
  id: string;
  /** Step title displayed in stepper */
  title: string;
  /** Step description (optional) */
  description?: string;
  /** Entity definition to use for this step's form */
  entity?: AnyEntity;
  /** Subset of entity fields to show in this step (if omitted, shows all) */
  fields?: string[];
  /** Whether the user can skip this step */
  allowSkip?: boolean;
  /** Conditions for step visibility (cross-step references use 'stepId.field' notation) */
  conditions?: {
    visible?: ConditionInput;
  };
  /** Field-level condition overrides for this step (e.g., make a field required based on previous step data) */
  fieldConditions?: Record<string, ConditionalBehavior>;
  /** Callback after step is completed */
  after?: (context: WorkflowStepContext) => void | Promise<void>;
  /** Custom render function for non-entity steps (e.g., review/summary) */
  custom?: (allData: Record<string, unknown>) => ReactNode;
  /** Custom validation for the step */
  validation?: {
    validate?: (data: Record<string, unknown>) => boolean | string;
    message?: string;
  };
}

/** Context passed to step callbacks */
export interface WorkflowStepContext {
  /** Data collected in the current step */
  data: Record<string, unknown>;
  /** All data collected across all steps */
  allData: Record<string, unknown>;
  /** Helper to prefill next step */
  next: {
    prefill: (values: Record<string, unknown>) => void;
  };
}

/** Full workflow configuration */
export interface WorkflowConfig {
  /** Unique workflow identifier */
  id: string;
  /** Workflow display name */
  name: string;
  /** Whether to persist progress to localStorage */
  persist?: boolean;
  /** Persistence key prefix (defaults to workflow id) */
  persistKey?: string;
  /** Workflow steps */
  steps: WorkflowStep[];
  /** Callback when all steps are completed */
  onComplete?: (allData: Record<string, unknown>) => void | Promise<void>;
}

/**
 * Define a multi-step workflow configuration.
 * Identity function that provides type safety and documentation.
 *
 * @param config - Workflow configuration
 * @returns The same config, typed as WorkflowConfig
 */
export function defineWorkflow(config: WorkflowConfig): WorkflowConfig {
  return config;
}
