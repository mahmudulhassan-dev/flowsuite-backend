import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import {
  shortenLink,
  listLinks,
  deleteLink,
  getLinkAnalytics,
  handleRedirect
} from './shortener.controller';

const shortenerRouter = Router();
const publicShortenerRouter = Router();

// Private CRUD routes
shortenerRouter.post('/', authenticate, shortenLink);
shortenerRouter.get('/', authenticate, listLinks);
shortenerRouter.delete('/:id', authenticate, deleteLink);
shortenerRouter.get('/:id/analytics', authenticate, getLinkAnalytics);

// Public redirection route
publicShortenerRouter.get('/:slug', handleRedirect);

export { shortenerRouter, publicShortenerRouter };
