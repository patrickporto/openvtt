import * as v from 'valibot';
import { describe, expect, it } from 'bun:test';
import {
  SoundDefSchema,
  SoundGroupSchema,
  SpatialAttrsSchema,
  TimelineCueSchema,
  TimelineTrackSchema,
} from '../src/schemas';

describe('SoundDefSchema', () => {
  it('aplica defaults', () => {
    const def = v.parse(SoundDefSchema, { src: 'a.mp3' });
    expect(def).toMatchObject({
      volume: 1,
      loop: false,
      channel: 'ambient',
      html5: false,
      preload: true,
    });
  });

  it('rejeita volume fora de [0,1]', () => {
    expect(() => v.parse(SoundDefSchema, { src: 'a.mp3', volume: 1.5 })).toThrow();
    expect(() => v.parse(SoundDefSchema, { src: 'a.mp3', volume: -0.1 })).toThrow();
  });

  it('rejeita src ausente ou vazia', () => {
    expect(() => v.parse(SoundDefSchema, {})).toThrow();
    expect(() => v.parse(SoundDefSchema, { src: [] })).toThrow();
  });
});

describe('SpatialAttrsSchema', () => {
  it('aplica defaults do panner', () => {
    expect(v.parse(SpatialAttrsSchema, {})).toMatchObject({
      panningModel: 'equalpower',
      distanceModel: 'inverse',
      refDistance: 1,
      maxDistance: 10000,
      rolloffFactor: 1,
      coneInnerAngle: 360,
      coneOuterAngle: 360,
      coneOuterGain: 0,
    });
  });

  it('rejeita distanceModel inválido', () => {
    expect(() => v.parse(SpatialAttrsSchema, { distanceModel: 'cubic' })).toThrow();
  });
});

describe('Timeline schemas', () => {
  it('cue exige soundId e startMs >= 0', () => {
    expect(() => v.parse(TimelineCueSchema, { soundId: 'a', startMs: -1 })).toThrow();
    const cue = v.parse(TimelineCueSchema, { soundId: 'a', startMs: 0 });
    expect(cue.fadeInMs).toBeUndefined();
    expect(cue).toMatchObject({ fadeOutMs: 0 });
  });

  it('track exige ao menos uma cue', () => {
    expect(() => v.parse(TimelineTrackSchema, { cues: [] })).toThrow();
    expect(v.parse(TimelineTrackSchema, { cues: [{ soundId: 'a', startMs: 0 }] })).toMatchObject({ loop: false });
  });
});

describe('SoundGroupSchema', () => {
  it('exige ao menos um membro', () => {
    expect(() => v.parse(SoundGroupSchema, { members: [] })).toThrow();
    expect(v.parse(SoundGroupSchema, { members: ['a'] })).toMatchObject({ noRepeat: true });
  });
});
