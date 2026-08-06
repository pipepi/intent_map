import {
  pipLimit,
  resolvePipIoPolicy,
} from "../app/runtime/pip-io-policy.ts";

const optionFields = Object.freeze({
  "--max-pip-size": "maxPipBytes",
  "--max-resource-size": "maxSingleResourceBytes",
  "--max-expanded-size": "maxExpandedBytes",
  "--max-resource-count": "maxResourceCount",
  "--max-compression-ratio": "maxCompressionRatio",
});

const fieldOptions = Object.fromEntries(
  Object.entries(optionFields).map(([option, field]) => [field, option]),
);

const parseLimit = (value, option) => {
  if (value === "ask" || value === "unlimited") return { mode: value };
  if (!/^(0|[1-9]\d*)$/.test(value ?? "")) {
    throw new Error(`${option} requires a non-negative integer, ask, or unlimited`);
  }
  return pipLimit(BigInt(value));
};

export const pipIoOptionsFromArgs = (args) => {
  const cli = {};
  for (const [option, field] of Object.entries(optionFields)) {
    const positions = args.flatMap((value, index) => value === option ? [index] : []);
    if (positions.length > 1) throw new Error(`${option} may only be provided once`);
    if (positions.length === 1) cli[field] = parseLimit(args[positions[0] + 1], option);
  }
  const allowPackageLimits = args.includes("--allow-package-limits");
  return {
    policy: resolvePipIoPolicy({ cli }).policy,
    confirm: ({ field, actual }) => {
      if (allowPackageLimits) return true;
      throw new Error(
        `PIP metric ${field}=${actual} requires ${fieldOptions[field]} <value|unlimited> or --allow-package-limits`,
      );
    },
  };
};
