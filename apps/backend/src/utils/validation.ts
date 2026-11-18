import type { z } from 'zod';

import { AppError } from './errors.js';

export interface ValidationIssue {
  path: string;
  message: string;
}

export function formatZodIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message }));
}

/** Parses request input with a Zod schema; throws a 400 VALIDATION_ERROR describing every issue. */
export function parseInput<Schema extends z.ZodType>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) throw AppError.validation(formatZodIssues(result.error));
  return result.data;
}

/** One-line reason for a rejected batch item. */
export function describeFirstIssue(error: z.ZodError): string {
  const [issue] = formatZodIssues(error);
  return issue ? (issue.path ? `${issue.path}: ${issue.message}` : issue.message) : 'Invalid item';
}
