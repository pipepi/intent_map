import { init, parse } from "es-module-lexer";

export async function assertSelfContainedEsm(source: string, label = "entry.mjs") {
  await init;
  let imports: ReturnType<typeof parse>[0];
  try {
    [imports] = parse(source, label);
  } catch (error) {
    throw new Error(`${label} cannot be parsed as ESM`, { cause: error });
  }
  const dependency = imports.find((item) => item.d !== -2);
  if (!dependency) return;
  const kind = dependency.d === -1 ? "static import or re-export" : "dynamic import";
  const excerpt = source.slice(dependency.ss, dependency.se).replace(/\s+/g, " ").slice(0, 120);
  throw new Error(`${label} must be a self-contained ESM module; ${kind} at ${dependency.ss}-${dependency.se}: ${excerpt}`);
}
