import {
  ASK_PIP_IO_POLICY,
  assertPipIoPolicy,
  type PipIoPolicy,
} from "./pip-io-policy";

const STORAGE_KEY = "intent-map:pip-io-policy:1";

const nativeHostUrl = (token?: string | null) => {
  if (typeof window === "undefined") return null;
  if (!token && window.location.protocol !== "pip:") return null;
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  return `/__pip/io-policy${query}`;
};

export const loadLocalPipIoPolicy = async (
  token?: string | null,
): Promise<PipIoPolicy> => {
  const url = nativeHostUrl(token);
  if (url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Host 返回 ${response.status}`);
    return assertPipIoPolicy(await response.json());
  }
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored
    ? assertPipIoPolicy(JSON.parse(stored) as unknown)
    : ASK_PIP_IO_POLICY;
};

export const saveLocalPipIoPolicy = async (
  policy: PipIoPolicy,
  token?: string | null,
): Promise<void> => {
  const validated = assertPipIoPolicy(policy);
  const url = nativeHostUrl(token);
  if (url) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validated),
    });
    if (!response.ok) throw new Error(await response.text() || `Host 返回 ${response.status}`);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
};
