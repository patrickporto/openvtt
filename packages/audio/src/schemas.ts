import * as v from 'valibot';

export const UnitIntervalSchema = v.pipe(v.number(), v.minValue(0), v.maxValue(1));

export const SpatialAttrsSchema = v.object({
  panningModel: v.optional(v.picklist(['equalpower', 'HRTF']), 'equalpower'),
  distanceModel: v.optional(v.picklist(['linear', 'inverse', 'exponential']), 'inverse'),
  refDistance: v.optional(v.pipe(v.number(), v.minValue(0)), 1),
  maxDistance: v.optional(v.pipe(v.number(), v.minValue(0)), 10000),
  rolloffFactor: v.optional(v.pipe(v.number(), v.minValue(0)), 1),
  coneInnerAngle: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(360)), 360),
  coneOuterAngle: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(360)), 360),
  coneOuterGain: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 0),
});

export type SpatialAttrs = v.InferOutput<typeof SpatialAttrsSchema>;
export type SpatialAttrsInput = v.InferInput<typeof SpatialAttrsSchema>;

export const SpriteSchema = v.record(
  v.string(),
  v.union([
    v.tuple([v.pipe(v.number(), v.minValue(0)), v.pipe(v.number(), v.minValue(0))]),
    v.tuple([
      v.pipe(v.number(), v.minValue(0)),
      v.pipe(v.number(), v.minValue(0)),
      v.boolean(),
    ]),
  ]),
);

export type Sprite = v.InferOutput<typeof SpriteSchema>;

export const SoundSourceSchema = v.union([
  v.pipe(v.string(), v.minLength(1)),
  v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.minLength(1)),
]);

export const SoundDefSchema = v.object({
  id: v.optional(v.pipe(v.string(), v.uuid())),
  src: SoundSourceSchema,
  volume: v.optional(UnitIntervalSchema, 1),
  loop: v.optional(v.boolean(), false),
  channel: v.optional(v.string(), 'ambient'),
  html5: v.optional(v.boolean(), false),
  preload: v.optional(v.boolean(), true),
  sprite: v.optional(SpriteSchema),
  pannerAttr: v.optional(SpatialAttrsSchema),
});

export type SoundDef = v.InferOutput<typeof SoundDefSchema>;
export type SoundDefInput = v.InferInput<typeof SoundDefSchema>;

export const TimelineCueSchema = v.object({
  id: v.optional(v.pipe(v.string(), v.uuid())),
  soundId: v.string(),
  startMs: v.pipe(v.number(), v.minValue(0)),
  durationMs: v.optional(v.pipe(v.number(), v.minValue(0))),
  fadeInMs: v.optional(v.pipe(v.number(), v.minValue(0))),
  fadeOutMs: v.optional(v.pipe(v.number(), v.minValue(0)), 0),
  startOffsetMs: v.optional(v.pipe(v.number(), v.minValue(0)), 0),
});

export type TimelineCue = v.InferOutput<typeof TimelineCueSchema>;
export type TimelineCueInput = v.InferInput<typeof TimelineCueSchema>;

export const TimelineTrackSchema = v.object({
  id: v.optional(v.pipe(v.string(), v.uuid())),
  cues: v.pipe(v.array(TimelineCueSchema), v.minLength(1)),
  loop: v.optional(v.boolean(), false),
});

export type TimelineTrack = v.InferOutput<typeof TimelineTrackSchema>;
export type TimelineTrackInput = v.InferInput<typeof TimelineTrackSchema>;

export const SoundGroupSchema = v.object({
  id: v.optional(v.pipe(v.string(), v.uuid())),
  members: v.pipe(v.array(v.string()), v.minLength(1)),
  noRepeat: v.optional(v.boolean(), true),
});

export type SoundGroup = v.InferOutput<typeof SoundGroupSchema>;
export type SoundGroupInput = v.InferInput<typeof SoundGroupSchema>;
