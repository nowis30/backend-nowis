import 'dotenv/config';

import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  ADVISOR_ENGINE: z.enum(['heuristic', 'gpt']).default('heuristic'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_MODEL: z.string().default('gpt-4.1'),
  OPENAI_MODEL_CORE: z.string().optional(),
  OPENAI_MODEL_TARGETED: z.string().optional(),
  OPENAI_MODEL_VISION: z.string().optional(),
  OPENAI_PROVIDER: z.enum(['openai', 'azure']).optional(),
  OPENAI_AZURE_DEPLOYMENT: z.string().optional(),
  OPENAI_API_VERSION: z.string().optional(),
  ADVISOR_PORTAL_API_KEY: z.string().optional()
});

export const env = envSchema.parse(process.env);
