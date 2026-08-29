import { fact_id, fact_node } from "./base.js";

export function account_fact(terminal_id, state) {
  const member = state.member;
  const account_key = member?.id ?? member?.memberId ?? member?.username;
  const account_id = account_key ? fact_id(terminal_id, "account", account_key) : undefined;
  return { node: account_id ? fact_node(terminal_id, "account", account_key, member) : undefined, account_id, account_key };
}

export const project_account = (value) => ({ label: value.username ?? value.memberId ?? value.id ?? "Account", value });
