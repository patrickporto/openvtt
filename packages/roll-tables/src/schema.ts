import * as v from 'valibot';

export const entryTypeSchema = v.picklist(['text', 'formula', 'table', 'document']);

export const documentRefSchema = v.object({
  collection: v.string(),
  id: v.string(),
});

export const tableEntrySchema = v.object({
  id: v.optional(v.pipe(v.string(), v.uuid())),
  type: v.optional(entryTypeSchema, 'text'),
  weight: v.optional(v.pipe(v.number(), v.minValue(0)), 1),
  range: v.optional(
    v.tuple([v.pipe(v.number(), v.integer()), v.pipe(v.number(), v.integer())]),
  ),
  text: v.optional(v.string()),
  img: v.optional(v.string()),
  formula: v.optional(v.string()),
  documentRef: v.optional(documentRefSchema),
  tableRef: v.optional(v.string()),
});

export const reshuffleSchema = v.picklist(['never', 'auto', 'manual']);

export const rollTableSchema = v.object({
  id: v.optional(v.pipe(v.string(), v.uuid())),
  name: v.pipe(v.string(), v.minLength(1)),
  description: v.optional(v.string()),
  img: v.optional(v.string()),
  formula: v.optional(v.string(), '1'),
  replacement: v.optional(v.boolean(), true),
  reshuffle: v.optional(reshuffleSchema, 'never'),
  displayRoll: v.optional(v.boolean(), true),
  entries: v.array(tableEntrySchema),
});

export type EntryType = v.InferOutput<typeof entryTypeSchema>;
export type DocumentRef = v.InferOutput<typeof documentRefSchema>;
export type TableEntryData = v.InferOutput<typeof tableEntrySchema>;
export type RollTableData = v.InferOutput<typeof rollTableSchema>;
export type ReshufflePolicy = v.InferOutput<typeof reshuffleSchema>;
export type TableEntryInput = v.InferInput<typeof tableEntrySchema>;
export type RollTableInput = v.InferInput<typeof rollTableSchema>;
