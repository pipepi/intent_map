import { fact_node } from "./base.js";

export function balance_facts(terminal_id, state, account_id, account_key) {
  return (state.wallets ?? state.assets ?? []).map((wallet) => {
    const unit = wallet.unit ?? wallet.coin ?? wallet.currency ?? "unknown";
    return fact_node(terminal_id, "balance", `${account_key ?? "guest"}:${unit}`, wallet,
      account_id ? [{ role: "account", target: account_id }] : []);
  });
}

export const project_balance = (value) => ({ label: value.unit ?? value.coin ?? value.currency ?? "Balance", value });
