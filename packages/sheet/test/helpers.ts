import { SheetEngine, createDocument } from '../src';
import type { CharacterDocument, SystemPack } from '../src';

export function makeIds(prefix = 'e'): () => string {
  let n = 0;
  return () => `${prefix}-${String(++n).padStart(4, '0')}`;
}

export function makeEngine(
  pack: SystemPack,
  base: Record<string, unknown>,
  options: {
    id?: () => string;
    bus?: ConstructorParameters<typeof SheetEngine>[1]['bus'];
    roller?: ConstructorParameters<typeof SheetEngine>[1]['roller'];
  } = {},
): { engine: SheetEngine; document: CharacterDocument } {
  const document = createDocument(pack, { base });
  const engine = new SheetEngine(document, {
    pack,
    id: options.id ?? makeIds(),
    bus: options.bus,
    roller: options.roller,
  });
  return { engine, document };
}

export function d20(count = 1, modifiers: readonly object[] = []) {
  return {
    type: 'die' as const,
    count,
    faces: { kind: 'number' as const, value: 20 },
    ...(modifiers.length > 0 ? { modifiers } : {}),
  };
}
