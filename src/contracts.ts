import { z } from 'zod';
import { UPSTREAM_TOOL_DEFS, type UpstreamToolDef } from './generated/upstream-tools.ts';

export interface ToolContract {
  name: string;
  description: string;
  shape: Record<string, z.ZodTypeAny>;
}

function paramSchema(p: UpstreamToolDef['params'][number]): z.ZodTypeAny {
  let s: z.ZodTypeAny = p.enum && p.enum.length > 0
    ? z.enum(p.enum as [string, ...string[]])
    : z.string();
  s = s.describe(p.description);
  return p.required ? s : s.optional();
}

export function buildContracts(): ToolContract[] {
  return UPSTREAM_TOOL_DEFS.map((def) => ({
    name: def.name,
    description: def.description,
    shape: Object.fromEntries(def.params.map((p) => [p.name, paramSchema(p)])),
  }));
}

export const TOOL_CONTRACTS: ToolContract[] = buildContracts();