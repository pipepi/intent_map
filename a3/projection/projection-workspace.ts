import type { IntentNode } from "../../app/runtime/model.ts";
import type { WorkspaceResource } from "../workspace/resource-index.ts";
import type { WorkspaceResourceSession } from "../workspace/resource-store.ts";
import {
  A3_PROJECTION_INDEX_MIME,
  A3_PROJECTION_INDEX_PATH,
  A3_PROJECTION_INDEX_SCHEMA_VERSION,
  a3ProjectionIndexResource,
  assertA3ProjectionIndex,
  auditA3ProjectionIndex,
  readA3ProjectionIndexResource,
  type A3ProjectionDiagnostic,
  type A3ProjectionEntry,
  type A3ProjectionIndex,
} from "./projection-index.ts";

export type A3ProjectionResetPlan = {
  projectionId: string;
  resourcePaths: string[];
  includesManualContent: boolean;
};

export class A3ProjectionWorkspaceSession {
  readonly #root: IntentNode;
  readonly #resources: WorkspaceResourceSession;
  #index: A3ProjectionIndex;
  #dirty = false;

  constructor(
    root: IntentNode,
    resources: WorkspaceResourceSession,
    index: A3ProjectionIndex,
  ) {
    this.#root = structuredClone(root);
    this.#resources = resources;
    this.#index = assertA3ProjectionIndex(index);
  }

  get index(): A3ProjectionIndex {
    return structuredClone(this.#index);
  }

  get dirty(): boolean {
    return this.#dirty;
  }

  list(): readonly A3ProjectionEntry[] {
    return structuredClone(this.#index.projections);
  }

  projection(projectionId: string): A3ProjectionEntry | undefined {
    const entry = this.#index.projections.find((candidate) => candidate.projectionId === projectionId);
    return entry ? structuredClone(entry) : undefined;
  }

  async audit(): Promise<A3ProjectionDiagnostic[]> {
    return auditA3ProjectionIndex({
      index: this.#index,
      root: this.#root,
      resources: this.#resources.index,
    });
  }

  async readResource(projectionId: string, resourcePath: string): Promise<WorkspaceResource> {
    const projection = this.projection(projectionId);
    if (!projection) throw new Error(`Projection does not exist: ${projectionId}`);
    if (!projection.resourcePaths.includes(resourcePath)) {
      throw new Error(`${resourcePath} is not owned by ${projectionId}`);
    }
    return this.#resources.read(resourcePath);
  }

  async writeResource(
    projectionId: string,
    resource: WorkspaceResource,
    {
      attach = false,
      origin = "manual",
    }: { attach?: boolean; origin?: "generated" | "manual" } = {},
  ): Promise<void> {
    const projection = this.projection(projectionId);
    if (!projection) throw new Error(`Projection does not exist: ${projectionId}`);
    const owner = this.#index.projections.find((candidate) =>
      candidate.resourcePaths.includes(resource.path));
    if (owner && owner.projectionId !== projectionId) {
      throw new Error(`${resource.path} is already owned by ${owner.projectionId}`);
    }
    if (!owner && !attach) {
      throw new Error(`${resource.path} must be explicitly attached to ${projectionId}`);
    }
    await this.#resources.write(resource);
    const resourcePaths = owner
      ? projection.resourcePaths
      : [...projection.resourcePaths, resource.path].sort((left, right) => left.localeCompare(right));
    const materialization = origin === "manual" && projection.materialization === "generated"
      ? "mixed"
      : projection.materialization;
    this.upsert({ ...projection, resourcePaths, materialization });
  }

  detachResource(projectionId: string, resourcePath: string): void {
    const projection = this.projection(projectionId);
    if (!projection) throw new Error(`Projection does not exist: ${projectionId}`);
    if (!projection.resourcePaths.includes(resourcePath)) {
      throw new Error(`${resourcePath} is not owned by ${projectionId}`);
    }
    this.upsert({
      ...projection,
      resourcePaths: projection.resourcePaths.filter((path) => path !== resourcePath),
    });
  }

  upsert(entry: A3ProjectionEntry): void {
    const projections = [
      ...this.#index.projections.filter(({ projectionId }) => projectionId !== entry.projectionId),
      structuredClone(entry),
    ].sort((left, right) => left.projectionId.localeCompare(right.projectionId));
    this.#index = assertA3ProjectionIndex({
      schemaVersion: A3_PROJECTION_INDEX_SCHEMA_VERSION,
      projections,
    });
    this.#dirty = true;
  }

  detach(projectionId: string): A3ProjectionEntry {
    const projection = this.projection(projectionId);
    if (!projection) throw new Error(`Projection does not exist: ${projectionId}`);
    this.#index = {
      ...this.#index,
      projections: this.#index.projections.filter((candidate) =>
        candidate.projectionId !== projectionId),
    };
    this.#dirty = true;
    return projection;
  }

  planReset(
    projectionId: string,
    { allowManualContent = false }: { allowManualContent?: boolean } = {},
  ): A3ProjectionResetPlan {
    const projection = this.projection(projectionId);
    if (!projection) throw new Error(`Projection does not exist: ${projectionId}`);
    const includesManualContent = projection.materialization !== "generated";
    if (includesManualContent && !allowManualContent) {
      throw new Error(`${projectionId} contains manual content and requires explicit confirmation`);
    }
    return {
      projectionId,
      resourcePaths: [...projection.resourcePaths],
      includesManualContent,
    };
  }

  async save(): Promise<void> {
    if (!this.#dirty && this.#resources.entry(A3_PROJECTION_INDEX_PATH)) return;
    await this.#resources.write(a3ProjectionIndexResource(this.#index));
    this.#dirty = false;
  }
}

export const openA3ProjectionWorkspace = async (
  root: IntentNode,
  resources: WorkspaceResourceSession,
): Promise<A3ProjectionWorkspaceSession> => {
  const entry = resources.entry(A3_PROJECTION_INDEX_PATH);
  const index = entry
    ? readA3ProjectionIndexResource(await resources.read(A3_PROJECTION_INDEX_PATH))
    : {
      schemaVersion: A3_PROJECTION_INDEX_SCHEMA_VERSION,
      projections: [],
    } as A3ProjectionIndex;
  if (entry && entry.mediaType !== A3_PROJECTION_INDEX_MIME) {
    throw new Error("a3 projection index has an invalid media type");
  }
  return new A3ProjectionWorkspaceSession(root, resources, index);
};
