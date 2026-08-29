import { fact_node } from "./base.js";

export const robot_fact = (terminal_id, state) => fact_node(terminal_id, "robot", "default", {
  enabled: Boolean(state.botEnabled), fast: Boolean(state.botFast), guard: Boolean(state.botGuard),
  side: state.botSide ?? "AUTO", orderType: state.botType ?? "AUTO",
});

export const project_robot = (value) => ({ label: "Robot", summary: value.enabled ? `${value.side} · ${value.orderType}` : "Disabled", value });
