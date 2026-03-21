import prisma from "./db.server";
import { ensureShopFoundation } from "./models.shop.server";

export type WorkflowStatus = "DRAFT" | "PUBLISHED" | "PAUSED" | "ARCHIVED";
export type WorkflowRunStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type WorkflowTriggerType = "ORDER_CREATED" | "ORDER_UPDATED" | "CHECKOUT_ABANDONED" | "MANUAL";

export type WorkflowBlockType = "trigger" | "delay" | "condition" | "send_message" | "end";

export type WorkflowTriggerBlock = {
  id: string;
  type: "trigger";
  triggerType: WorkflowTriggerType;
};

export type WorkflowDelayBlock = {
  id: string;
  type: "delay";
  waitSeconds: number;
};

export type WorkflowConditionBlock = {
  id: string;
  type: "condition";
  conditionType: "order_total_gte" | "customer_has_phone";
  thresholdAmount?: number;
};

export type WorkflowSendMessageBlock = {
  id: string;
  type: "send_message";
  templateKey: string;
  messageText: string;
};

export type WorkflowEndBlock = {
  id: string;
  type: "end";
};

export type WorkflowBlock =
  | WorkflowTriggerBlock
  | WorkflowDelayBlock
  | WorkflowConditionBlock
  | WorkflowSendMessageBlock
  | WorkflowEndBlock;

export type WorkflowDefinition = {
  version: 1;
  blocks: WorkflowBlock[];
};

export type WorkflowValidationIssue = {
  path: string;
  message: string;
};

type WorkflowRecord = {
  id: string;
  shopDomain: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  definitionJson: string;
  validationErrorsJson: string | null;
  publishedAt: Date | null;
  pausedAt: Date | null;
  archivedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
};

type WorkflowRunRecord = {
  id: string;
  workflowId: string;
  triggerType: WorkflowTriggerType;
  status: WorkflowRunStatus;
  failedStepId: string | null;
  failureReason: string | null;
  executionLogJson: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaWorkflowDb = {
  workflow: {
    create: (args: Record<string, unknown>) => Promise<WorkflowRecord>;
    update: (args: Record<string, unknown>) => Promise<WorkflowRecord>;
    findUnique: (args: Record<string, unknown>) => Promise<WorkflowRecord | null>;
    findMany: (args: Record<string, unknown>) => Promise<WorkflowRecord[]>;
  };
  workflowRun: {
    create: (args: Record<string, unknown>) => Promise<WorkflowRunRecord>;
    findMany: (args: Record<string, unknown>) => Promise<WorkflowRunRecord[]>;
  };
};

const db = prisma as unknown as PrismaWorkflowDb;

function normalizeOptionalString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStatus(value: string | null): WorkflowStatus {
  if (value === "PUBLISHED" || value === "PAUSED" || value === "ARCHIVED") {
    return value;
  }

  return "DRAFT";
}

function parseWorkflowDefinitionRaw(input: string | null): WorkflowDefinition {
  if (!input || input.trim().length === 0) {
    return { version: 1, blocks: [] };
  }

  try {
    const parsed = JSON.parse(input) as WorkflowDefinition;

    return {
      version: parsed.version === 1 ? 1 : 1,
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
    };
  } catch {
    return { version: 1, blocks: [] };
  }
}

function parseStoredDefinition(definitionJson: string): WorkflowDefinition {
  return parseWorkflowDefinitionRaw(definitionJson);
}

function parseStoredValidationErrors(value: string | null): WorkflowValidationIssue[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as WorkflowValidationIssue[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseExecutionLog(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as string[];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function validateWorkflowDefinition(definition: WorkflowDefinition): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = [];

  if (definition.version !== 1) {
    issues.push({ path: "version", message: "Workflow definition version must be 1." });
  }

  if (!Array.isArray(definition.blocks) || definition.blocks.length === 0) {
    issues.push({ path: "blocks", message: "At least one block is required." });
    return issues;
  }

  const seenIds = new Set<string>();
  const blockIds = definition.blocks.map((block) => block.id);

  definition.blocks.forEach((block, index) => {
    const pathPrefix = `blocks[${index}]`;

    if (!block.id || typeof block.id !== "string") {
      issues.push({ path: `${pathPrefix}.id`, message: "Block id is required." });
      return;
    }

    if (seenIds.has(block.id)) {
      issues.push({ path: `${pathPrefix}.id`, message: `Duplicate block id '${block.id}'.` });
    }

    seenIds.add(block.id);

    if (!["trigger", "delay", "condition", "send_message", "end"].includes(block.type)) {
      issues.push({ path: `${pathPrefix}.type`, message: "Unsupported block type." });
      return;
    }

    if (block.type === "delay") {
      const delayBlock = block as WorkflowDelayBlock;
      if (!Number.isFinite(delayBlock.waitSeconds) || delayBlock.waitSeconds < 0) {
        issues.push({ path: `${pathPrefix}.waitSeconds`, message: "Delay waitSeconds must be >= 0." });
      }
    }

    if (block.type === "condition") {
      const conditionBlock = block as WorkflowConditionBlock;
      if (!["order_total_gte", "customer_has_phone"].includes(conditionBlock.conditionType)) {
        issues.push({ path: `${pathPrefix}.conditionType`, message: "Unsupported condition type." });
      }

      if (conditionBlock.conditionType === "order_total_gte") {
        if (
          typeof conditionBlock.thresholdAmount !== "number" ||
          !Number.isFinite(conditionBlock.thresholdAmount) ||
          conditionBlock.thresholdAmount < 0
        ) {
          issues.push({
            path: `${pathPrefix}.thresholdAmount`,
            message: "order_total_gte requires thresholdAmount >= 0.",
          });
        }
      }
    }

    if (block.type === "send_message") {
      const sendMessageBlock = block as WorkflowSendMessageBlock;
      if (typeof sendMessageBlock.templateKey !== "string" || sendMessageBlock.templateKey.trim().length === 0) {
        issues.push({ path: `${pathPrefix}.templateKey`, message: "templateKey is required." });
      }

      if (typeof sendMessageBlock.messageText !== "string" || sendMessageBlock.messageText.trim().length === 0) {
        issues.push({ path: `${pathPrefix}.messageText`, message: "messageText is required." });
      }
    }
  });

  const triggerBlocks = definition.blocks.filter((item) => item.type === "trigger");

  if (triggerBlocks.length !== 1) {
    issues.push({ path: "blocks", message: "Exactly one trigger block is required." });
  }

  if (definition.blocks[0]?.type !== "trigger") {
    issues.push({ path: "blocks[0]", message: "First block must be trigger." });
  }

  if (definition.blocks[definition.blocks.length - 1]?.type !== "end") {
    issues.push({ path: `blocks[${definition.blocks.length - 1}]`, message: "Last block must be end." });
  }

  if (!blockIds.includes("end")) {
    const hasEndType = definition.blocks.some((item) => item.type === "end");
    if (!hasEndType) {
      issues.push({ path: "blocks", message: "Workflow must contain an end block." });
    }
  }

  return issues;
}

function toWorkflowSummary(record: WorkflowRecord) {
  const validationIssues = parseStoredValidationErrors(record.validationErrorsJson);

  return {
    id: record.id,
    name: record.name,
    description: record.description ?? "",
    status: record.status,
    validationIssueCount: validationIssues.length,
    updatedAt: record.updatedAt,
    createdAt: record.createdAt,
    publishedAt: record.publishedAt,
    pausedAt: record.pausedAt,
    archivedAt: record.archivedAt,
  };
}

export function parseWorkflowFormData(formData: FormData) {
  return {
    workflowId: normalizeOptionalString(formData.get("workflowId")),
    name: normalizeOptionalString(formData.get("name")) ?? "Untitled workflow",
    description: normalizeOptionalString(formData.get("description")),
    status: normalizeStatus(normalizeOptionalString(formData.get("status"))),
    definition: parseWorkflowDefinitionRaw(normalizeOptionalString(formData.get("definitionJson"))),
  };
}

export function buildWorkflowExecutionPreview(definition: WorkflowDefinition): string[] {
  return definition.blocks.map((block, index) => {
    const step = index + 1;

    if (block.type === "trigger") {
      return `${step}. Trigger: ${(block as WorkflowTriggerBlock).triggerType}`;
    }

    if (block.type === "delay") {
      return `${step}. Delay ${(block as WorkflowDelayBlock).waitSeconds}s`;
    }

    if (block.type === "condition") {
      const conditionBlock = block as WorkflowConditionBlock;
      if (conditionBlock.conditionType === "order_total_gte") {
        return `${step}. Condition order_total_gte >= ${conditionBlock.thresholdAmount ?? "?"}`;
      }

      return `${step}. Condition customer_has_phone`;
    }

    if (block.type === "send_message") {
      const sendBlock = block as WorkflowSendMessageBlock;
      return `${step}. Send message template=${sendBlock.templateKey || "(missing)"}`;
    }

    return `${step}. End`;
  });
}

export async function listWorkflows(shopDomain: string) {
  await ensureShopFoundation(shopDomain);

  const workflows = await db.workflow.findMany({
    where: { shopDomain },
    orderBy: [{ updatedAt: "desc" }],
    take: 50,
  });

  return workflows.map(toWorkflowSummary);
}

export async function getWorkflowById(shopDomain: string, workflowId: string) {
  await ensureShopFoundation(shopDomain);

  const workflow = await db.workflow.findUnique({ where: { id: workflowId } });

  if (!workflow || workflow.shopDomain !== shopDomain) {
    return null;
  }

  const definition = parseStoredDefinition(workflow.definitionJson);
  const validationIssues = parseStoredValidationErrors(workflow.validationErrorsJson);

  return {
    ...toWorkflowSummary(workflow),
    definition,
    validationIssues,
    previewSteps: buildWorkflowExecutionPreview(definition),
  };
}

export async function upsertWorkflow(args: {
  shopDomain: string;
  workflowId?: string | null;
  name: string;
  description?: string | null;
  definition: WorkflowDefinition;
}) {
  await ensureShopFoundation(args.shopDomain);

  const validationIssues = validateWorkflowDefinition(args.definition);

  const baseData = {
    name: args.name,
    description: args.description ?? null,
    definitionJson: JSON.stringify(args.definition),
    validationErrorsJson: validationIssues.length > 0 ? JSON.stringify(validationIssues) : null,
    lastValidatedAt: new Date(),
  };

  const workflow = args.workflowId
    ? await db.workflow.update({
        where: { id: args.workflowId },
        data: baseData,
      })
    : await db.workflow.create({
        data: {
          shopDomain: args.shopDomain,
          ...baseData,
          status: "DRAFT" satisfies WorkflowStatus,
        },
      });

  return {
    workflowId: workflow.id,
    validationIssues,
  };
}

export async function transitionWorkflowStatus(args: {
  shopDomain: string;
  workflowId: string;
  nextStatus: WorkflowStatus;
}) {
  const workflow = await db.workflow.findUnique({ where: { id: args.workflowId } });

  if (!workflow || workflow.shopDomain !== args.shopDomain) {
    throw new Error("[workflow] workflow not found");
  }

  const definition = parseStoredDefinition(workflow.definitionJson);
  const validationIssues = validateWorkflowDefinition(definition);

  if (args.nextStatus === "PUBLISHED" && validationIssues.length > 0) {
    await db.workflow.update({
      where: { id: workflow.id },
      data: {
        validationErrorsJson: JSON.stringify(validationIssues),
        lastValidatedAt: new Date(),
      },
    });

    return {
      ok: false as const,
      error: "Workflow has validation issues and cannot be published.",
      validationIssues,
    };
  }

  const now = new Date();

  await db.workflow.update({
    where: { id: workflow.id },
    data: {
      status: args.nextStatus,
      validationErrorsJson: validationIssues.length > 0 ? JSON.stringify(validationIssues) : null,
      lastValidatedAt: now,
      publishedAt: args.nextStatus === "PUBLISHED" ? now : workflow.publishedAt,
      pausedAt: args.nextStatus === "PAUSED" ? now : workflow.pausedAt,
      archivedAt: args.nextStatus === "ARCHIVED" ? now : workflow.archivedAt,
    },
  });

  return {
    ok: true as const,
    validationIssues,
  };
}

export async function createWorkflowRunPreview(args: {
  shopDomain: string;
  workflowId: string;
  triggerType: WorkflowTriggerType;
}) {
  const workflow = await db.workflow.findUnique({ where: { id: args.workflowId } });

  if (!workflow || workflow.shopDomain !== args.shopDomain) {
    throw new Error("[workflow] workflow not found");
  }

  const definition = parseStoredDefinition(workflow.definitionJson);
  const issues = validateWorkflowDefinition(definition);
  const previewSteps = buildWorkflowExecutionPreview(definition);

  const failed = issues.length > 0;

  await db.workflowRun.create({
    data: {
      workflowId: workflow.id,
      shopDomain: args.shopDomain,
      triggerType: args.triggerType,
      status: failed ? "FAILED" : "SUCCEEDED",
      triggerPayloadJson: JSON.stringify({ source: "preview" }),
      executionLogJson: JSON.stringify(previewSteps),
      failedStepId: failed ? definition.blocks[0]?.id ?? null : null,
      failureReason: failed ? issues.map((issue) => issue.message).join("; ") : null,
      startedAt: new Date(),
      completedAt: failed ? null : new Date(),
      failedAt: failed ? new Date() : null,
    },
  });

  return {
    failed,
    issues,
  };
}

export async function listWorkflowRuns(shopDomain: string, workflowId: string) {
  await ensureShopFoundation(shopDomain);

  const rows = await db.workflowRun.findMany({
    where: {
      shopDomain,
      workflowId,
    },
    orderBy: [{ createdAt: "desc" }],
    take: 50,
  });

  return rows.map((row) => ({
    id: row.id,
    triggerType: row.triggerType,
    status: row.status,
    failedStepId: row.failedStepId,
    failureReason: row.failureReason,
    executionLog: parseExecutionLog(row.executionLogJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export function getDefaultWorkflowDefinition(): WorkflowDefinition {
  return {
    version: 1,
    blocks: [
      { id: "trigger_order_created", type: "trigger", triggerType: "ORDER_CREATED" },
      { id: "delay_5m", type: "delay", waitSeconds: 300 },
      { id: "condition_has_phone", type: "condition", conditionType: "customer_has_phone" },
      {
        id: "send_order_message",
        type: "send_message",
        templateKey: "order_confirmation_v1",
        messageText: "Thanks for your order!",
      },
      { id: "end", type: "end" },
    ],
  };
}
