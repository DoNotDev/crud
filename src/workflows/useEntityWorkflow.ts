'use client';
// packages/features/crud/src/workflows/useEntityWorkflow.ts

/**
 * @fileoverview useEntityWorkflow hook
 * @description Core workflow orchestration hook. Manages step navigation, data collection,
 * condition evaluation, and persistence for multi-step entity workflows.
 *
 * @example
 * ```typescript
 * const workflow = useEntityWorkflow(onboardingConfig, {
 *   onComplete: async (data) => await api.createAccount(data),
 * });
 *
 * // Access: workflow.currentStep, workflow.goNext(), workflow.goPrevious(), etc.
 * ```
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';

import { evaluateCondition } from '@donotdev/core';

import {
  saveWorkflowState,
  loadWorkflowState,
  clearWorkflowState,
} from './WorkflowPersistence';

import type { WorkflowConfig, WorkflowStep } from './defineWorkflow';

/** Options for useEntityWorkflow */
export interface UseEntityWorkflowOptions {
  /** Callback when all steps are completed and data is submitted */
  onComplete?: (allData: Record<string, unknown>) => void | Promise<void>;
  /** Callback when step changes */
  onStepChange?: (fromIndex: number, toIndex: number) => void;
  /** Default values to pre-fill across steps */
  defaultValues?: Record<string, unknown>;
}

/** Return type of useEntityWorkflow */
export interface EntityWorkflowReturn {
  /** Current step configuration */
  currentStep: WorkflowStep;
  /** Current step index (0-based, relative to visible steps) */
  currentStepIndex: number;
  /** Steps after condition filtering (only visible steps) */
  visibleSteps: WorkflowStep[];
  /** Data per step (keyed by step id) */
  stepData: Record<string, Record<string, unknown>>;
  /** Merged data across all steps */
  allData: Record<string, unknown>;
  /** Navigate to next step (validates current step first) */
  goNext: (currentStepData?: Record<string, unknown>) => Promise<boolean>;
  /** Navigate to previous step */
  goPrevious: () => void;
  /** Skip current step (only if allowSkip is true) */
  skipStep: () => void;
  /** Jump to a specific step by index */
  goToStep: (index: number) => void;
  /** Whether current step is the first visible step */
  isFirst: boolean;
  /** Whether current step is the last visible step */
  isLast: boolean;
  /** Whether the workflow is submitting (final step) */
  isSubmitting: boolean;
  /** Whether the current step can proceed (no validation errors) */
  canGoNext: boolean;
  /** Force save current state to localStorage */
  persistNow: () => void;
  /** Clear all persisted state */
  clearPersisted: () => void;
  /** Prefill data for a specific step */
  prefillStep: (stepId: string, values: Record<string, unknown>) => void;
}

/**
 * Orchestrate a multi-step entity workflow.
 *
 * @param config - Workflow configuration from defineWorkflow()
 * @param options - Workflow options (callbacks, defaults)
 * @returns Workflow state and navigation methods
 */
export function useEntityWorkflow(
  config: WorkflowConfig,
  options: UseEntityWorkflowOptions = {}
): EntityWorkflowReturn {
  const { onComplete, onStepChange, defaultValues } = options;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Step data store (keyed by step id)
  const [stepData, setStepData] = useState<
    Record<string, Record<string, unknown>>
  >(() => {
    // Try to restore persisted state
    if (config.persist) {
      const persisted = loadWorkflowState(config.persistKey ?? config.id);
      if (persisted) return persisted.stepData;
    }
    // Distribute defaultValues across steps
    if (defaultValues) {
      const distributed: Record<string, Record<string, unknown>> = {};
      for (const step of config.steps) {
        if (step.entity && step.fields) {
          const data: Record<string, unknown> = {};
          for (const field of step.fields) {
            if (field in defaultValues) {
              data[field] = defaultValues[field];
            }
          }
          if (Object.keys(data).length > 0) {
            distributed[step.id] = data;
          }
        }
      }
      return distributed;
    }
    return {};
  });

  // Current step index
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(() => {
    if (config.persist) {
      const persisted = loadWorkflowState(config.persistKey ?? config.id);
      if (persisted) return persisted.currentStepIndex;
    }
    return 0;
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Merge all step data into one flat object
  const allData = useMemo(() => {
    const merged: Record<string, unknown> = {};
    for (const [stepId, data] of Object.entries(stepData)) {
      // Also make data accessible as stepId.field for cross-step conditions
      for (const [key, value] of Object.entries(data)) {
        merged[key] = value;
        merged[`${stepId}.${key}`] = value;
      }
    }
    return merged;
  }, [stepData]);

  // Filter steps by conditions
  const visibleSteps = useMemo(() => {
    return config.steps.filter((step) => {
      if (!step.conditions?.visible) return true;
      return evaluateCondition(step.conditions.visible, allData);
    });
  }, [config.steps, allData]);

  // Current step (always defined — config.steps must have at least 1 step)
  const currentStep = (visibleSteps[currentStepIndex] ?? visibleSteps[0])!;

  // Navigation guards
  const isFirst = currentStepIndex === 0;
  const isLast = currentStepIndex === visibleSteps.length - 1;

  // Persist state when it changes
  useEffect(() => {
    if (config.persist) {
      saveWorkflowState(config.persistKey ?? config.id, {
        currentStepIndex,
        stepData,
        savedAt: Date.now(),
      });
    }
  }, [
    config.persist,
    config.persistKey,
    config.id,
    currentStepIndex,
    stepData,
  ]);

  const goNext = useCallback(
    async (currentStepData?: Record<string, unknown>): Promise<boolean> => {
      const step = visibleSteps[currentStepIndex];
      if (!step) return false;

      // Save current step data
      if (currentStepData) {
        setStepData((prev) => ({
          ...prev,
          [step.id]: { ...prev[step.id], ...currentStepData },
        }));
      }

      // Run step validation if defined
      if (step.validation?.validate) {
        const mergedForValidation = {
          ...allData,
          ...(currentStepData ?? {}),
        };
        const result = step.validation.validate(mergedForValidation);
        if (result !== true) {
          // Validation failed — stay on current step
          return false;
        }
      }

      // Run after callback
      if (step.after) {
        const prefillData: Record<string, Record<string, unknown>> = {};
        await step.after({
          data: currentStepData ?? stepData[step.id] ?? {},
          allData: { ...allData, ...(currentStepData ?? {}) },
          next: {
            prefill: (values) => {
              const nextStep = visibleSteps[currentStepIndex + 1];
              if (nextStep) {
                prefillData[nextStep.id] = values;
              }
            },
          },
        });
        // Apply prefills
        if (Object.keys(prefillData).length > 0) {
          setStepData((prev) => {
            const updated = { ...prev };
            for (const [id, values] of Object.entries(prefillData)) {
              updated[id] = { ...updated[id], ...values };
            }
            return updated;
          });
        }
      }

      // If last step, submit
      if (isLast) {
        setIsSubmitting(true);
        try {
          const finalData = { ...allData, ...(currentStepData ?? {}) };
          const completeFn = onCompleteRef.current ?? config.onComplete;
          if (completeFn) {
            await completeFn(finalData);
          }
          // Clear persistence on success
          if (config.persist) {
            clearWorkflowState(config.persistKey ?? config.id);
          }
          return true;
        } catch {
          return false;
        } finally {
          setIsSubmitting(false);
        }
      }

      // Move to next step
      const nextIndex = currentStepIndex + 1;
      setCurrentStepIndex(nextIndex);
      onStepChange?.(currentStepIndex, nextIndex);
      return true;
    },
    [
      visibleSteps,
      currentStepIndex,
      allData,
      stepData,
      isLast,
      config,
      onStepChange,
    ]
  );

  const goPrevious = useCallback(() => {
    if (isFirst) return;
    const prevIndex = currentStepIndex - 1;
    setCurrentStepIndex(prevIndex);
    onStepChange?.(currentStepIndex, prevIndex);
  }, [currentStepIndex, isFirst, onStepChange]);

  const skipStep = useCallback(() => {
    const step = visibleSteps[currentStepIndex];
    if (!step?.allowSkip || isLast) return;
    const nextIndex = currentStepIndex + 1;
    setCurrentStepIndex(nextIndex);
    onStepChange?.(currentStepIndex, nextIndex);
  }, [visibleSteps, currentStepIndex, isLast, onStepChange]);

  const goToStep = useCallback(
    (index: number) => {
      if (index >= 0 && index < visibleSteps.length) {
        onStepChange?.(currentStepIndex, index);
        setCurrentStepIndex(index);
      }
    },
    [visibleSteps.length, currentStepIndex, onStepChange]
  );

  const persistNow = useCallback(() => {
    if (config.persist) {
      saveWorkflowState(config.persistKey ?? config.id, {
        currentStepIndex,
        stepData,
        savedAt: Date.now(),
      });
    }
  }, [config, currentStepIndex, stepData]);

  const clearPersisted = useCallback(() => {
    clearWorkflowState(config.persistKey ?? config.id);
  }, [config]);

  const prefillStep = useCallback(
    (stepId: string, values: Record<string, unknown>) => {
      setStepData((prev) => ({
        ...prev,
        [stepId]: { ...prev[stepId], ...values },
      }));
    },
    []
  );

  return {
    currentStep,
    currentStepIndex,
    visibleSteps,
    stepData,
    allData,
    goNext,
    goPrevious,
    skipStep,
    goToStep,
    isFirst,
    isLast,
    isSubmitting,
    canGoNext: !isSubmitting,
    persistNow,
    clearPersisted,
    prefillStep,
  };
}
