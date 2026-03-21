import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import {
  createWorkflowRunPreview,
  getDefaultWorkflowDefinition,
  getWorkflowById,
  listWorkflowRuns,
  listWorkflows,
  parseWorkflowFormData,
  transitionWorkflowStatus,
  upsertWorkflow,
  type WorkflowStatus,
} from "../workflows.builder.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const workflowId = url.searchParams.get("workflowId");

  const workflows = await listWorkflows(session.shop);
  const selectedWorkflowId = workflowId ?? workflows[0]?.id ?? null;

  const selectedWorkflow = selectedWorkflowId
    ? await getWorkflowById(session.shop, selectedWorkflowId)
    : null;

  const runs = selectedWorkflow ? await listWorkflowRuns(session.shop, selectedWorkflow.id) : [];

  return {
    workflows,
    selectedWorkflow,
    runs,
    defaultDefinition: getDefaultWorkflowDefinition(),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save-workflow") {
    const parsed = parseWorkflowFormData(formData);
    const result = await upsertWorkflow({
      shopDomain: session.shop,
      workflowId: parsed.workflowId,
      name: parsed.name,
      description: parsed.description,
      definition: parsed.definition,
    });

    return {
      intent,
      workflowId: result.workflowId,
      errors: result.validationIssues,
      ok: true,
    };
  }

  if (intent === "preview-run") {
    const workflowId = formData.get("workflowId");

    if (typeof workflowId !== "string" || workflowId.trim().length === 0) {
      return { intent, ok: false, message: "Select a workflow before running preview." };
    }

    const preview = await createWorkflowRunPreview({
      shopDomain: session.shop,
      workflowId,
      triggerType: "MANUAL",
    });

    return {
      intent,
      ok: !preview.failed,
      message: preview.failed ? "Preview run failed due to workflow validation errors." : "Preview run succeeded.",
    };
  }

  if (intent === "transition-status") {
    const workflowId = formData.get("workflowId");
    const statusRaw = formData.get("nextStatus");

    if (typeof workflowId !== "string" || workflowId.trim().length === 0) {
      return { intent, ok: false, message: "Missing workflow id." };
    }

    const nextStatus: WorkflowStatus =
      statusRaw === "PUBLISHED" || statusRaw === "PAUSED" || statusRaw === "ARCHIVED"
        ? statusRaw
        : "DRAFT";

    const result = await transitionWorkflowStatus({
      shopDomain: session.shop,
      workflowId,
      nextStatus,
    });

    if (!result.ok) {
      return {
        intent,
        ok: false,
        message: result.error,
        errors: result.validationIssues,
      };
    }

    return {
      intent,
      ok: true,
      message: `Workflow status updated to ${nextStatus}.`,
    };
  }

  return { intent, ok: false, message: "Unsupported workflow action." };
};

export default function WorkflowsPage() {
  const { workflows, selectedWorkflow, runs, defaultDefinition } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const definitionForEditor = selectedWorkflow
    ? JSON.stringify(selectedWorkflow.definition, null, 2)
    : JSON.stringify(defaultDefinition, null, 2);

  return (
    <s-page heading="Workflows (V1 Foundation)">
      <s-section heading="Existing workflows">
        {workflows.length === 0 ? (
          <s-paragraph>No workflows yet. Create your first draft below.</s-paragraph>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Validation issues</th>
                <th>Updated</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((workflow) => (
                <tr key={workflow.id}>
                  <td>{workflow.name}</td>
                  <td>{workflow.status}</td>
                  <td>{workflow.validationIssueCount}</td>
                  <td>{new Date(workflow.updatedAt).toLocaleString()}</td>
                  <td>
                    <a href={`/app/workflows?workflowId=${workflow.id}`}>Edit</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </s-section>

      <s-section heading={selectedWorkflow ? "Edit workflow" : "Create workflow"}>
        <s-paragraph>
          Supported V1 blocks: trigger, delay, condition, send message, end. Supported triggers are ORDER_CREATED,
          ORDER_UPDATED, CHECKOUT_ABANDONED, and MANUAL.
        </s-paragraph>

        <Form method="post">
          <input type="hidden" name="intent" value="save-workflow" />
          <input type="hidden" name="workflowId" value={selectedWorkflow?.id ?? ""} />

          <s-stack direction="block" gap="base">
            <label>
              Name
              <input name="name" type="text" defaultValue={selectedWorkflow?.name ?? ""} required />
            </label>

            <label>
              Description
              <textarea name="description" defaultValue={selectedWorkflow?.description ?? ""} rows={2} />
            </label>

            <label>
              Definition JSON
              <textarea
                name="definitionJson"
                defaultValue={definitionForEditor}
                rows={18}
                style={{ width: "100%", fontFamily: "monospace" }}
              />
            </label>

            <button type="submit">Save draft</button>
          </s-stack>
        </Form>

        {actionData?.intent === "save-workflow" && actionData.ok ? (
          <s-banner tone="success">Workflow saved.</s-banner>
        ) : null}
      </s-section>

      {selectedWorkflow ? (
        <>
          <s-section heading="Publish / pause / archive">
            <s-stack direction="inline" gap="base">
              <Form method="post">
                <input type="hidden" name="intent" value="transition-status" />
                <input type="hidden" name="workflowId" value={selectedWorkflow.id} />
                <input type="hidden" name="nextStatus" value="PUBLISHED" />
                <button type="submit">Publish</button>
              </Form>

              <Form method="post">
                <input type="hidden" name="intent" value="transition-status" />
                <input type="hidden" name="workflowId" value={selectedWorkflow.id} />
                <input type="hidden" name="nextStatus" value="PAUSED" />
                <button type="submit">Pause</button>
              </Form>

              <Form method="post">
                <input type="hidden" name="intent" value="transition-status" />
                <input type="hidden" name="workflowId" value={selectedWorkflow.id} />
                <input type="hidden" name="nextStatus" value="ARCHIVED" />
                <button type="submit">Archive</button>
              </Form>
            </s-stack>

            <s-paragraph>Current status: {selectedWorkflow.status}</s-paragraph>
          </s-section>

          <s-section heading="Validation and execution preview">
            {selectedWorkflow.validationIssues.length === 0 ? (
              <s-paragraph>No validation issues.</s-paragraph>
            ) : (
              <ul>
                {selectedWorkflow.validationIssues.map((issue) => (
                  <li key={`${issue.path}-${issue.message}`}>
                    {issue.path}: {issue.message}
                  </li>
                ))}
              </ul>
            )}

            <s-paragraph>Execution preview:</s-paragraph>
            {selectedWorkflow.previewSteps.length === 0 ? (
              <s-paragraph>No steps available.</s-paragraph>
            ) : (
              <ol>
                {selectedWorkflow.previewSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}

            <Form method="post">
              <input type="hidden" name="intent" value="preview-run" />
              <input type="hidden" name="workflowId" value={selectedWorkflow.id} />
              <button type="submit">Run preview execution</button>
            </Form>
          </s-section>

          <s-section heading="Run history">
            {runs.length === 0 ? (
              <s-paragraph>No run history yet.</s-paragraph>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Trigger</th>
                    <th>Status</th>
                    <th>Failed step</th>
                    <th>Failure reason</th>
                    <th>Execution log</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td>{new Date(run.createdAt).toLocaleString()}</td>
                      <td>{run.triggerType}</td>
                      <td>{run.status}</td>
                      <td>{run.failedStepId ?? "-"}</td>
                      <td>{run.failureReason ?? "-"}</td>
                      <td>{run.executionLog.length > 0 ? run.executionLog.join(" → ") : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </s-section>
        </>
      ) : null}

      {actionData?.message ? (
        <s-banner tone={actionData.ok ? "success" : "critical"}>{actionData.message}</s-banner>
      ) : null}
    </s-page>
  );
}
