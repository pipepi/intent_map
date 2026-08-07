import type { JsonValue } from "../../../app/runtime/model.ts";
import {
  A3CustomNodeRegistry,
  createA3CustomNodeExtension,
  type A3CustomNodeData,
} from "../../core/custom-nodes.ts";

export const SOFTWARE_AUTHORING_CAPABILITY = "software-authoring/1" as const;
export const SOFTWARE_INTENT_GOAL_KIND = "software-intent-goal/1" as const;
export const BUSINESS_FLOW_SCENARIO_KIND = "business-flow-scenario/1" as const;
export const BUSINESS_CONSTRAINT_KIND = "business-constraint/1" as const;

type RecordValue = { [key: string]: JsonValue };

const assertRecord = (value: JsonValue, label: string): RecordValue => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} settings must be an object`);
  }
  return value;
};

const assertText = (value: JsonValue | undefined, label: string) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be non-empty text`);
};

const assertOptionalText = (value: JsonValue | undefined, label: string) => {
  if (value !== undefined && (typeof value !== "string" || !value.trim())) {
    throw new Error(`${label} must be non-empty text when present`);
  }
};

const assertOptionalTextList = (value: JsonValue | undefined, label: string) => {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${label} must contain non-empty text`);
  }
};

export const softwareIntentGoal = ({
  objective,
  deepGoal,
}: {
  objective: string;
  deepGoal?: string;
}): A3CustomNodeData => ({
  kind: SOFTWARE_INTENT_GOAL_KIND,
  capability: SOFTWARE_AUTHORING_CAPABILITY,
  settings: { objective, ...(deepGoal === undefined ? {} : { deepGoal }) },
});

export const businessFlowScenario = ({
  scenario,
  trigger,
  outcome,
  constraints = [],
}: {
  scenario: string;
  trigger?: string;
  outcome: string;
  constraints?: string[];
}): A3CustomNodeData => ({
  kind: BUSINESS_FLOW_SCENARIO_KIND,
  capability: SOFTWARE_AUTHORING_CAPABILITY,
  settings: { scenario, ...(trigger === undefined ? {} : { trigger }), outcome, constraints },
});

export const businessConstraint = ({
  statement,
  rationale,
}: {
  statement: string;
  rationale?: string;
}): A3CustomNodeData => ({
  kind: BUSINESS_CONSTRAINT_KIND,
  capability: SOFTWARE_AUTHORING_CAPABILITY,
  settings: { statement, ...(rationale === undefined ? {} : { rationale }) },
});

export const createSoftwareAuthoringCustomNodeRegistry = () => {
  const registry = new A3CustomNodeRegistry();
  registry.register({
    kind: SOFTWARE_INTENT_GOAL_KIND,
    capability: SOFTWARE_AUTHORING_CAPABILITY,
    validateSettings(value) {
      const settings = assertRecord(value, "Software intent goal");
      assertText(settings.objective, "objective");
      assertOptionalText(settings.deepGoal, "deepGoal");
    },
  });
  registry.register({
    kind: BUSINESS_FLOW_SCENARIO_KIND,
    capability: SOFTWARE_AUTHORING_CAPABILITY,
    validateSettings(value) {
      const settings = assertRecord(value, "Business flow scenario");
      assertText(settings.scenario, "scenario");
      assertOptionalText(settings.trigger, "trigger");
      assertText(settings.outcome, "outcome");
      assertOptionalTextList(settings.constraints, "constraints");
    },
  });
  registry.register({
    kind: BUSINESS_CONSTRAINT_KIND,
    capability: SOFTWARE_AUTHORING_CAPABILITY,
    validateSettings(value) {
      const settings = assertRecord(value, "Business constraint");
      assertText(settings.statement, "statement");
      assertOptionalText(settings.rationale, "rationale");
    },
  });
  return registry;
};

export const softwareAuthoringExtension = (data: A3CustomNodeData) => {
  createSoftwareAuthoringCustomNodeRegistry().validate(data);
  return createA3CustomNodeExtension(data);
};
