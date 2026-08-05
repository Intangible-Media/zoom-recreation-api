import { test } from 'node:test';
import assert from 'node:assert/strict';

// pipelines.js imports src/config.js (via client.js), which throws at import time
// if any required env var is missing — these dummy values just need to satisfy
// that boot check, none of them are actually called out to. Set via process.env
// before the dynamic import below (a static import would run before this code,
// since imports are hoisted ahead of everything else in the module).
process.env.STRIPE_SECRET_KEY ??= 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_dummy';
process.env.WEBFLOW_SUCCESS_URL ??= 'https://example.com/success';
process.env.WEBFLOW_CANCEL_URL ??= 'https://example.com/cancel';
process.env.CORS_ORIGIN ??= 'https://example.com';
process.env.HUBSPOT_ACCESS_TOKEN ??= 'pat-dummy';
process.env.RESEND_API_KEY ??= 're_dummy';
process.env.EMAIL_FROM ??= 'Test <test@example.com>';
process.env.HUBSPOT_DEAL_PIPELINE ??= 'Sales Order Pipeline';

const { resolvePipelineAndStage } = await import('../src/hubspot/pipelines.js');

const pipelines = [
  {
    id: 'default-pipeline-id',
    label: 'Sales Pipeline',
    stages: [
      { id: 'default-stage-1', label: 'Appointment Scheduled', displayOrder: 0 },
      { id: 'default-stage-2', label: 'Closed Won', displayOrder: 1 },
    ],
  },
  {
    id: 'sales-order-pipeline-id',
    label: 'Sales Order Pipeline',
    // Deliberately out of displayOrder sequence in the array itself, so the test
    // actually exercises sorting by displayOrder rather than array position.
    stages: [
      { id: 'stage-closed', label: 'Closed', displayOrder: 2 },
      { id: 'stage-new', label: 'New', displayOrder: 0 },
      { id: 'stage-in-progress', label: 'In Progress', displayOrder: 1 },
    ],
  },
];

test('with no stage label configured, resolves to the pipeline\'s first stage by displayOrder (not array order)', () => {
  const result = resolvePipelineAndStage(pipelines, 'Sales Order Pipeline', undefined);
  assert.deepEqual(result, { pipelineId: 'sales-order-pipeline-id', stageId: 'stage-new' });
});

test('matches the pipeline label case-insensitively and ignoring surrounding whitespace', () => {
  const result = resolvePipelineAndStage(pipelines, '  sales order pipeline  ', undefined);
  assert.equal(result.pipelineId, 'sales-order-pipeline-id');
});

test('with an explicit stage label, resolves to that stage rather than the first one', () => {
  const result = resolvePipelineAndStage(pipelines, 'Sales Order Pipeline', 'In Progress');
  assert.deepEqual(result, { pipelineId: 'sales-order-pipeline-id', stageId: 'stage-in-progress' });
});

test('throws a clear error when the pipeline label matches nothing', () => {
  assert.throws(
    () => resolvePipelineAndStage(pipelines, 'Nonexistent Pipeline', undefined),
    /HubSpot deal pipeline "Nonexistent Pipeline" not found/,
  );
});

test('throws a clear error when the stage label matches nothing in that pipeline', () => {
  assert.throws(
    () => resolvePipelineAndStage(pipelines, 'Sales Order Pipeline', 'Nonexistent Stage'),
    /HubSpot deal stage "Nonexistent Stage" not found in pipeline "Sales Order Pipeline"/,
  );
});
