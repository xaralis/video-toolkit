import fs from 'fs';
import path from 'path';

/**
 * Project lifecycle endpoint backing the editor's phase control.
 *
 * `GET /project-state` reports the project's current phase from its
 * `project.json`; `POST { phase }` updates it (creating a minimal
 * `project.json` when the project doesn't have one yet — e.g. ad-hoc
 * projects created outside `/toolkit:video`). The file path is fixed at
 * construction time, never client-supplied.
 */

export const PROJECT_PHASES = ['planning', 'assets', 'review', 'audio', 'editing', 'rendering', 'complete'] as const;
export type ProjectPhase = (typeof PROJECT_PHASES)[number];

export interface CreateProjectStateHandlerOpts {
  /** Absolute path to the project's project.json. Config-time, never client-supplied. */
  projectJsonPath: string;
}

/** Minimal request/response shapes — matches Vite/Connect's middleware signature. */
export interface MinimalReq {
  method?: string;
  on(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
  on(event: 'end', listener: () => void): unknown;
}

export interface MinimalRes {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(chunk?: string): unknown;
}

function isPhase(value: unknown): value is ProjectPhase {
  return typeof value === 'string' && (PROJECT_PHASES as readonly string[]).includes(value);
}

export function createProjectStateHandler(
  opts: CreateProjectStateHandlerOpts,
): (req: MinimalReq, res: MinimalRes) => void {
  const { projectJsonPath } = opts;

  const json = (res: MinimalRes, status: number, payload: unknown): void => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  };

  const readProject = (): Record<string, unknown> | null => {
    try {
      return JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      return null; // missing or malformed — treated as "no project.json yet"
    }
  };

  return (req: MinimalReq, res: MinimalRes) => {
    if (req.method === 'GET') {
      const project = readProject();
      json(res, 200, {
        exists: project !== null,
        phase: project && isPhase(project.phase) ? project.phase : null,
        name: project && typeof project.name === 'string' ? project.name : undefined,
        phases: PROJECT_PHASES,
      });
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        let phase: unknown;
        try {
          phase = (JSON.parse(body || '{}') as { phase?: unknown }).phase;
        } catch {
          json(res, 400, { error: 'Malformed JSON body' });
          return;
        }
        if (!isPhase(phase)) {
          json(res, 400, { error: `phase must be one of: ${PROJECT_PHASES.join(', ')}` });
          return;
        }
        try {
          // Preserve every other field; create a minimal file when absent so
          // ad-hoc projects can still track their phase.
          const project = readProject() ?? { name: path.basename(path.dirname(projectJsonPath)) };
          project.phase = phase;
          project.updated = new Date().toISOString().slice(0, 10);
          fs.writeFileSync(projectJsonPath, `${JSON.stringify(project, null, 2)}\n`, 'utf-8');
          json(res, 200, { phase });
        } catch (err) {
          json(res, 500, { error: err instanceof Error ? err.message : 'Failed to write project.json' });
        }
      });
      return;
    }

    res.statusCode = 405;
    res.end();
  };
}
