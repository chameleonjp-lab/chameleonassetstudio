import { execFileSync } from 'node:child_process';
import os from 'node:os';

import { H3_CASES, getH3Case, makeMeasuredResult, runH3CoreCase, type H3Case } from './matrix';

function argumentValue(name: string): string | undefined {
  const direct = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (direct) {
    return direct.slice(name.length + 1);
  }
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sourceCommit(): string {
  const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  if (status) {
    throw new Error('The worktree is dirty. Commit the harness before collecting H3 evidence.');
  }
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function selectedCase(): H3Case {
  const caseId = argumentValue('--case') ?? H3_CASES[0].id;
  const definition = getH3Case(caseId);
  if (!definition) {
    throw new Error(`Unknown H3 case: ${caseId}. Use --list to inspect case IDs.`);
  }
  if (definition.tier === 'node-escalation' && !process.argv.includes('--allow-escalation')) {
    throw new Error(
      `${caseId} is an escalation case. Review the 240-frame result, then rerun with --allow-escalation.`,
    );
  }
  return definition;
}

async function main(): Promise<void> {
  if (process.argv.includes('--list')) {
    process.stdout.write(
      `${H3_CASES.map((definition) => `${definition.id}\t${definition.tier}\t${definition.label}`).join('\n')}\n`,
    );
    return;
  }

  const definition = selectedCase();
  const core = await runH3CoreCase(definition);
  const cpu = os.cpus()[0]?.model ?? null;
  const result = makeMeasuredResult({
    sourceCommit: sourceCommit(),
    definition,
    environment: {
      runtime: 'node',
      recordedAt: new Date().toISOString(),
      device: `${os.platform()} ${os.arch()}`,
      os: `${os.type()} ${os.release()}`,
      browser: null,
      userAgent: `Node ${process.version}`,
      viewport: null,
      devicePixelRatio: null,
      orientation: null,
      lowPowerMode: null,
      thermalState: null,
      cpu,
      logicalCpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
    },
    capabilities: {
      longTask: 'not-run',
      jsHeap: 'not-run',
      storageEstimate: 'not-run',
    },
    core,
    observations: {
      longTaskCount: null,
      longTaskTotalMs: null,
      jsHeapBeforeBytes: null,
      jsHeapAfterBytes: null,
      storageUsageBytes: null,
      storageQuotaBytes: null,
    },
    notes: [
      'Node core measurement only; this is not browser, renderer, save, Undo/Redo, reload, or iPhone evidence.',
      'No numeric H3 warning or hard cap is accepted by this result.',
    ],
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`H3 measurement failed: ${message}\n`);
  process.exitCode = 1;
});
