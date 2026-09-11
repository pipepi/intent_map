/** 核心持久化结构、引用、事务与派生索引；层级合法性由校验器统一约束。 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | {
    [key: string]: JsonValue;
};
export type PipRef = {
    node_id: string;
    pip_id: string;
    pip_id_parent?: string;
};
export type PipValue = {
    kind: "const";
    value: JsonValue;
} | {
    kind: "ref";
    target: PipRef;
} | {
    kind: "op";
    op: string;
    args: PipValue[];
};
// 常量对象兼容 Node 原生 TypeScript 类型擦除，无需枚举的运行时代码转换。
export const PipForkLevel = {
    DOCUMENT: 0, GRAPH: 1, NODE: 2, PIPE: 3
} as const;
export type PipForkLevel = typeof PipForkLevel[keyof typeof PipForkLevel];
export type PipPredicateValue = {
    predicate: PipRef;
    value: PipValue;
};
export type Pip = {
    id: string;
    fork_level: PipForkLevel;
    predicate_value?: PipPredicateValue;
    pips: Pip[];
};
export type PipOp = {
    op: "put";
    parent_path: string[];
    pip: Pip;
} | {
    op: "remove";
    parent_path: string[];
    pip_id: string;
};
/** GRAPH / DOCUMENT 事务必须携带 baseRevision；独立 NODE / PIPE 编辑不携带。 */
export type PipTx = {
    schemaVersion: 2;
    baseRevision?: number;
    operations: PipOp[];
};
export type PipIndex = {
    pips: Map<string, Pip>;
    refs: Map<string, PipRef>;
    outgoing: Map<string, PipRef[]>;
    incoming: Map<string, PipRef[]>;
};
export type AppliedPipTx = {
    pip: Pip;
    inverse: PipTx;
};
