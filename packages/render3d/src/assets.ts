export function resolveAssetPath(assetPath: string | undefined, source: string): string {
  if (!source) return source;
  if (/^(https?:)?\/\//.test(source) || source.startsWith('data:') || source.startsWith('blob:')) {
    return source;
  }
  const base = (assetPath || './').endsWith('/') ? (assetPath || './') : `${assetPath}/`;
  return base + source.replace(/^\.\//, '').replace(/^\//, '');
}
