// API と LLM 出力の Zod スキーマ。ここに登録したものは schema/<名前>.json に生成される（pnpm gen:schema）
import type { z } from "zod";

export const LAYER = "shared/contract";

/** 名前（kebab-case）→ スキーマ。ステップ3以降で追加する */
export const schemas: Record<string, z.ZodType> = {};
