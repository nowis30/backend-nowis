import 'dotenv/config';

import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16)
});

export const env = envSchema.parse(process.env);
