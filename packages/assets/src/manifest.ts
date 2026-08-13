import * as v from 'valibot';

export const AssetTypeSchema = v.picklist([
  'texture',
  'audio',
  'hdr',
  'cubemap',
  'model',
  'font',
  'binary',
  'json',
]);

export type AssetType = v.InferOutput<typeof AssetTypeSchema>;

export const AssetEntrySchema = v.looseObject({
  id: v.string(),
  url: v.string(),
  hash: v.optional(v.string()),
  type: v.optional(AssetTypeSchema),
  lazy: v.optional(v.boolean()),
  priority: v.optional(v.number()),
  size: v.optional(v.number()),
});

export type AssetEntry = v.InferOutput<typeof AssetEntrySchema>;

export const AssetManifestSchema = v.looseObject({
  name: v.string(),
  version: v.optional(v.string()),
  baseUrl: v.optional(v.string()),
  assets: v.array(AssetEntrySchema),
});

export type AssetManifest = v.InferOutput<typeof AssetManifestSchema>;

export function defineManifest(manifest: AssetManifest): AssetManifest {
  return v.parse(AssetManifestSchema, manifest);
}

export function parseManifest(input: unknown): AssetManifest {
  return v.parse(AssetManifestSchema, input);
}

export function assetCacheKey(entry: Pick<AssetEntry, 'id' | 'url' | 'hash'>): string {
  return entry.hash ?? entry.url ?? entry.id;
}
