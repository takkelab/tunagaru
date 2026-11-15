// gen.mjs のテスト用の contract
import { z } from "zod";

export const schemas: Record<string, z.ZodType> = {
  "health-response": z.object({ ok: z.literal(true) }),
};
