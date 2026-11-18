import type { Request, Response } from 'express';

import { requireUserId } from '../middleware/authenticate.js';
import { createWebsite, deleteWebsite, listWebsites, syncWebsites, updateWebsite } from '../services/website.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { parseInput } from '../utils/validation.js';
import { idParamsSchema } from '../validators/common.validators.js';
import {
  createWebsiteSchema,
  listWebsitesQuerySchema,
  updateWebsiteSchema,
  websitesSyncSchema,
} from '../validators/website.validators.js';

export async function listWebsitesHandler(req: Request, res: Response): Promise<void> {
  const { enabled } = parseInput(listWebsitesQuerySchema, req.query);
  sendSuccess(res, await listWebsites(requireUserId(req), { enabled: enabled === undefined ? undefined : enabled === 'true' }));
}

export async function createWebsiteHandler(req: Request, res: Response): Promise<void> {
  const input = parseInput(createWebsiteSchema, req.body);
  sendSuccess(res, await createWebsite(requireUserId(req), input), 201);
}

export async function updateWebsiteHandler(req: Request, res: Response): Promise<void> {
  const { id } = parseInput(idParamsSchema, req.params);
  const input = parseInput(updateWebsiteSchema, req.body);
  sendSuccess(res, await updateWebsite(requireUserId(req), id, input));
}

export async function deleteWebsiteHandler(req: Request, res: Response): Promise<void> {
  const { id } = parseInput(idParamsSchema, req.params);
  sendSuccess(res, await deleteWebsite(requireUserId(req), id));
}

export async function syncWebsitesHandler(req: Request, res: Response): Promise<void> {
  const { websites } = parseInput(websitesSyncSchema, req.body);
  sendSuccess(res, await syncWebsites(requireUserId(req), websites));
}
