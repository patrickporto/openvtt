import {
  MENU_ORDER,
  menu,
  menuControls,
  menuWhen,
  type ContextMenuContext,
  type ContextMenuItem,
  type PluginContext,
} from '@openvtt/canvas';
import type { SoundData } from './schemas';
import type { AudioPlugin } from './plugin';

const cells = (value: number): string => `${value} u`;

export function registerSoundsContextMenu(ctx: PluginContext, plugin: AudioPlugin): void {
  ctx.registerContextMenu({
    id: 'audio:context',
    when: menuWhen.selection('sound'),
    items: (c: ContextMenuContext): ContextMenuItem[] => {
      const obj = c.selection.find((o) => o.objectType === 'sound');
      if (!obj) return [];
      const doc = obj.document as SoundData;
      const commit = (changes: Partial<SoundData>, before?: Partial<SoundData>): void => {
        ctx.canvas.documents.update<SoundData>('sound', obj.id, changes, before ? { before } : undefined);
        ctx.bus.call('scene:refresh', {});
      };

      return [
        menu.toggle('audio:playing', doc.playing ? 'Pause' : 'Play', {
          checked: doc.playing,
          order: MENU_ORDER.state,
          onClick: () => commit({ playing: !doc.playing }, { playing: doc.playing }),
        }),
        menu.custom('audio:volume', () => {
          const original = doc.volume;
          return menuControls.slider({
            label: 'Volume',
            min: 0,
            max: 1,
            step: 0.05,
            value: original,
            live: (value) => plugin.previewSound(doc.id!, { volume: value }),
            commit: (value, before) => commit({ volume: value }, { volume: before }),
          });
        }, { height: 30, order: MENU_ORDER.edit }),
        menu.custom('audio:radius', () => {
          const original = doc.radius;
          return menuControls.slider({
            label: 'Radius',
            min: 0,
            max: 20,
            step: 0.5,
            value: original,
            format: cells,
            live: (value) => plugin.previewSound(doc.id!, { radius: value }),
            commit: (value, before) => commit({ radius: value }, { radius: before }),
          });
        }, { height: 30, order: MENU_ORDER.edit + 10 }),
      ];
    },
  });
}
