import rateLimit from 'express-rate-limit';

/** Guard the high-value phase feature mutations independently of the global API budget. */
export const shopTransactionLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Shop transaction rate limit exceeded' },
});

export const lootMutationLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Loot mutation rate limit exceeded' },
});
