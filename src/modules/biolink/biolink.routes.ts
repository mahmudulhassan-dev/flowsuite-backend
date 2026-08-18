import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import {
  createBiolink,
  listBiolinks,
  updateBiolink,
  deleteBiolink,
  getBiolinkBySlug,
  createBiolinkBlock,
  updateBiolinkBlock,
  deleteBiolinkBlock
} from './biolink.controller';

const biolinkRouter = Router();
const publicBiolinkRouter = Router();

// Private CRUD routes for Biolink Pages
biolinkRouter.post('/', authenticate, createBiolink);
biolinkRouter.get('/', authenticate, listBiolinks);
biolinkRouter.put('/:id', authenticate, updateBiolink);
biolinkRouter.delete('/:id', authenticate, deleteBiolink);

// Private CRUD routes for Biolink Blocks
biolinkRouter.post('/blocks', authenticate, createBiolinkBlock);
biolinkRouter.put('/blocks/:id', authenticate, updateBiolinkBlock);
biolinkRouter.delete('/blocks/:id', authenticate, deleteBiolinkBlock);

// Public route to resolve a biolink page configuration by slug
publicBiolinkRouter.get('/:slug', getBiolinkBySlug);

export { biolinkRouter, publicBiolinkRouter };
