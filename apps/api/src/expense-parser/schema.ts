import { z } from "zod";
import { timeZoneSchema } from "../time-zone.js";

export const parseRequest = z.strictObject({ text: z.string().trim().min(1).max(1500), time_zone: timeZoneSchema.optional() });
// Extraction only. Unknowns must be null; the model never supplies calculated shares.
export const extractionSchema = z.strictObject({
  amount: z.string().max(40).nullable(), amount_source: z.string().max(100).nullable(),
  description: z.string().trim().max(500).nullable(), merchant: z.string().trim().max(200).nullable(),
  category: z.string().max(100).nullable(), category_confidence: z.number().min(0).max(1),
  date_expression: z.string().max(100).nullable(), time_expression: z.string().max(100).nullable(),
  is_split: z.boolean(), participant_count: z.number().int().min(2).max(2147483647).nullable(),
  notes: z.string().max(5000).nullable(),
});
export type Extraction = z.infer<typeof extractionSchema>;
