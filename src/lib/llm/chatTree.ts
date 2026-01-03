import { WorldState, WorldStateSchema } from "@/lib/domain/schema";
import { z } from "zod";

const RoleSchema = z.enum(["user", "assistant", "system"]);

const PartSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("thought"),
        thought: z.string(),
    }),
    z.object({
        kind: z.literal("text"),
        text: z.string(),
    }),
    z.object({
        kind: z.literal("image_ref"),
        id: z.uuid(),
        caption: z.string().optional(),
    }),
]);

const ChatNodeIdSchema = z.uuid().brand("ChatNodeId");

export type Role = z.infer<typeof RoleSchema>;
export type Part = z.infer<typeof PartSchema>;
export type ChatNodeId = z.infer<typeof ChatNodeIdSchema>;

export const ChatNodeSchema = z.object({
    id: ChatNodeIdSchema,
    relation: z.enum(["reply", "regenerate", "rewrite", "initiate"]),
    role: RoleSchema,
    parts: z.array(PartSchema),
    parentId: ChatNodeIdSchema.optional(),
    createdAt: z.iso.datetime(),
    state: WorldStateSchema.optional(),
});

export type ChatNode = z.infer<typeof ChatNodeSchema>;

export const ChatTreeSchema = z.object({
    rootId: ChatNodeIdSchema,
    headId: ChatNodeIdSchema,

    nodes: z.record(ChatNodeIdSchema, ChatNodeSchema),
    children: z.record(ChatNodeIdSchema, z.array(ChatNodeIdSchema)).default({}),
    activeChildByParent: z.record(ChatNodeIdSchema, ChatNodeIdSchema).default({}),
});

export type ChatTree = z.infer<typeof ChatTreeSchema>;

const nowIso = () => new Date().toISOString();
const makeId = () => crypto.randomUUID() as ChatNodeId;

const pushUnique = <T>(arr: readonly T[], item: T): T[] => {
    return arr.includes(item) ? [...arr] : [...arr, item];
};

const getChildren = (tree: ChatTree, parentId: ChatNodeId): ChatNodeId[] => {
    return tree.children[parentId] ?? [];
};

const setNewChild = (tree: ChatTree, parentId: ChatNodeId, childNode: ChatNode): ChatTree => {
    const children = getChildren(tree, parentId);
    const nextChildren = pushUnique(children, childNode.id);
    return {
        ...tree,
        children: {
            ...tree.children,
            [parentId]: nextChildren,
        },
    };
};

type AddNodeArgs = {
    parentId: ChatNodeId;
    relation: ChatNode["relation"];
    role: Role;
    parts: Part[];
    state?: WorldState;
};

export const createEmptyTree = (startingSystemPrompt: string, initialState?: WorldState): ChatTree => {
    const rootId = makeId();
    const root: ChatNode = {
        id: rootId,
        relation: "initiate",
        role: "system",
        parts: [{ kind: "text", text: startingSystemPrompt }],
        parentId: undefined,
        createdAt: nowIso(),
        state: initialState,
    };

    return {
        rootId,
        headId: rootId,
        nodes: { [rootId]: root },
        children: {},
        activeChildByParent: {},
    };
};

/**
 * Pure function:
 * - adds a new node as child of parentId
 * - updates children[parentId]
 * - auto-activates that child for the parent
 * - moves headId to the new node
 */
export const addChildAndAutoActivate = (
    tree: ChatTree,
    args: AddNodeArgs
): ChatTree => {
    const childId = makeId();

    if (!tree.nodes[args.parentId]) {
        throw new Error(`parentId does not exist in nodes. parentId=${args.parentId}`);
    }

    const childNode: ChatNode = {
        id: childId,
        relation: args.relation,
        role: args.role,
        parts: args.parts,
        parentId: args.parentId,
        createdAt: nowIso(),
        state: args.state,
    };


    const treeWithChildren = setNewChild(
        tree,
        args.parentId,
        childNode
    );

    const nextTree: ChatTree = {
        ...treeWithChildren,
        activeChildByParent: {
            ...treeWithChildren.activeChildByParent,
            [args.parentId]: childId,
        },
        nodes: {
            ...treeWithChildren.nodes,
            [childId]: childNode,
        },
        headId: childId,
    };

    return nextTree;
};

export const appendUser = (
    tree: ChatTree,
    text: string
): ChatTree => {
    return addChildAndAutoActivate(tree, {
        parentId: tree.headId,
        relation: "reply",
        role: "user",
        parts: [{ kind: "text", text }],
    });
};

export const replyAssistant = (
    tree: ChatTree,
    parentUserId: ChatNodeId,
    parts: Part[],
    state?: WorldState
): ChatTree => {
    return addChildAndAutoActivate(tree, {
        parentId: parentUserId,
        relation: "reply",
        role: "assistant",
        parts,
        state,
    });
};

export const regenerateAssistant = (
    tree: ChatTree,
    regenerateTargetNodeId: ChatNodeId,
    parts: Part[],
    state?: WorldState
): ChatTree => {
    if (!tree.nodes[regenerateTargetNodeId].parentId) {
        throw new Error(
            `regenerateTargetNodeId does not have a parentId. regenerateTargetNodeId=${regenerateTargetNodeId}`
        );
    }
    return addChildAndAutoActivate(tree, {
        parentId: tree.nodes[regenerateTargetNodeId].parentId,
        relation: "regenerate",
        role: "assistant",
        parts,
        state,
    });
};

export const rewriteNode = (
    tree: ChatTree,
    rewriteTargetNodeId: ChatNodeId,
    parts: Part[]
): ChatTree => {
    if (!tree.nodes[rewriteTargetNodeId].parentId) {
        throw new Error(
            `rewriteTargetNodeId does not have a parentId. rewriteTargetNodeId=${rewriteTargetNodeId}`
        );
    }
    return addChildAndAutoActivate(tree, {
        parentId: tree.nodes[rewriteTargetNodeId].parentId,
        relation: "rewrite",
        role: tree.nodes[rewriteTargetNodeId].role,
        parts,
    });
};

export const getAlternatives = (tree: ChatTree, parentId: ChatNodeId): ChatNode[] => {
    const ids = getChildren(tree, parentId);
    return ids.map((id) => tree.nodes[id]).filter(Boolean);
};

export const setActive = (
    tree: ChatTree,
    targetNodeId: ChatNodeId,
    opts: { moveHead?: boolean } = { moveHead: true }
): ChatTree => {
    if (!tree.nodes[targetNodeId].parentId) {
        throw new Error(
            `targetNodeId does not have a parentId. targetNodeId=${targetNodeId}`
        );
    }
    const parentId = tree.nodes[targetNodeId].parentId;
    const kids = getChildren(tree, parentId);
    if (!kids.includes(targetNodeId)) {
        throw new Error(
            `targetNodeId is not in children[parentId]. parentId=${parentId}, targetNodeId=${targetNodeId}`
        );
    }

    const next: ChatTree = {
        ...tree,
        activeChildByParent: {
            ...tree.activeChildByParent,
            [parentId]: targetNodeId,
        },
    };

    if (opts.moveHead ?? true) {
        return {
            ...next,
            headId: targetNodeId,
        };
    }
    return recalculateHeadId(next);
};

export const setHead = (tree: ChatTree, headId: ChatNodeId): ChatTree => {
    return {
        ...tree,
        headId,
    };
};

/**
 * headId から parentId を辿ってノード列を返す（activeChildByParentは使わない版）
 * - limit: 直近Nノード
 * - stopAtRoot: rootIdで止める
 *
 * NOTE:
 * これは「現在の headId が指す経路」を返す。
 * 「activeChildByParent で選ばれた経路を再構成」したい場合は別関数を用意する。
 */
export const getPathNodesFromHead = (
    tree: ChatTree,
    opts: { limit?: number; stopAtRoot?: boolean } = { stopAtRoot: true }
): ChatNode[] => {
    const limit = opts.limit ?? 10;
    const stopAtRoot = opts.stopAtRoot ?? true;

    const out: ChatNode[] = [];
    let curId: ChatNodeId | undefined = tree.headId;

    while (curId && out.length < limit) {
        const node: ChatNode | undefined = tree.nodes[curId];
        if (!node) break;

        out.push(node);

        if (stopAtRoot && curId === tree.rootId) break;
        curId = node.parentId;
    }

    return out.reverse();
};

/**
 * rootId から activeChildByParent を辿って「採用経路」を返す
 * - limit: 最大ノード数（無限ループ保険）
 */
export const getActivePathNodes = (
    tree: ChatTree,
    opts: { limit?: number } = {}
): ChatNode[] => {
    const limit = opts.limit ?? 10_000;

    const out: ChatNode[] = [];
    let curId: ChatNodeId = tree.rootId;

    for (let i = 0; i < limit; i++) {
        const node = tree.nodes[curId];
        if (!node) break;
        out.push(node);

        const nextId = tree.activeChildByParent[curId];
        if (!nextId) break;
        curId = nextId;
    }

    return out;
};

export const getHeadNode = (tree: ChatTree): ChatNode => {
    const node = tree.nodes[tree.headId];
    if (!node) throw new Error(`headId not found: ${tree.headId}`);
    return node;
};

export const recalculateHeadId = (tree: ChatTree): ChatTree => {
    let nodeId = tree.rootId;
    while (true) {
        if (!tree.activeChildByParent[nodeId]) break;
        nodeId = tree.activeChildByParent[nodeId];
    }
    return {
        ...tree,
        headId: nodeId,
    };
};