import { z } from 'zod';
import type { JsonSchema, ToolSchema } from '../llm.types';

/**
 * RG-LL4: a tool's JSON Schema is generated from its Zod schema — one source of truth for its arguments.
 * `io: 'input'` describes what the model must send (a field with a default is optional there).
 */
export function toolSchemaFromZod(name: string, description: string, schema: z.ZodType): ToolSchema {
  const parameters = { ...(z.toJSONSchema(schema, { io: 'input' }) as JsonSchema) };
  // The dialect marker is noise for a provider's `parameters` field and rejected by some.
  delete parameters.$schema;
  return { name, description, parameters };
}
