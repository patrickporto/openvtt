import { newId } from '@openvtt/events';
import type { StepResult } from '@openvtt/physics';

import type { DiceBus, RerollContext } from '../bus';
import { RollCancelledError } from '../errors';
import type { DieResult, RollResult } from '../results';
import {
  BODY_SLEEP_STATE,
  createEmptyThrowVector,
  type DiceMesh,
  type DiceSetStyle,
} from '../services/dice-mesh';
import type { DiceFactory } from '../services/factory';
import type { NotationParser, ParsedNotation } from '../services/notation';
import type { PhysicsController } from './physics-controller';
import type { DiceSpawner } from './spawner';
import type { SoundManager } from './sounds';
import type { RollQueue } from './roll-queue';
import type { ThrowPlanner } from './throw-planner';
import type { CameraHeights, DisplayConfig, Vector2D } from './types';

export type AnimState = 'idle' | 'throw' | 'selector' | 'afterthrow' | 'simulate';

export type SelectorDie = string | { type: string; style?: DiceSetStyle };

export interface RollTimingConfig {
  timestep: number;
  iterationLimit: number;
  strength: number;
}

export interface RollOrchestratorDeps {
  bus: DiceBus;
  queue: RollQueue;
  physics: PhysicsController;
  planner: ThrowPlanner;
  spawner: DiceSpawner;
  parser: NotationParser;
  sounds: SoundManager;
  shapes: Pick<DiceFactory, 'getShapeDescriptor'>;
  swapFace: (mesh: DiceMesh, result: number) => Promise<void>;
  getConfig: () => RollTimingConfig;
  getDisplay: () => DisplayConfig;
  relayout: () => void;
  renderFrame: () => void;
  clearSelection: () => void;
  isDisposed: () => boolean;
}

export class RollOrchestrator {
  #animState: AnimState = 'idle';
  #threadId = 0;
  #dieIndex = 0;
  #iteration = 0;
  #rollToken = 0;
  #currentRollId = '';
  #rolling = false;
  #notationVectors?: ParsedNotation;
  #selector: { dice: string[] } = { dice: [] };

  constructor(private deps: RollOrchestratorDeps) {}

  get rolling(): boolean {
    return this.#rolling;
  }

  get running(): boolean {
    return this.#animState !== 'idle';
  }

  get idle(): boolean {
    return this.#animState === 'idle';
  }

  get animState(): AnimState {
    return this.#animState;
  }

  get notationVectors(): ParsedNotation | undefined {
    return this.#notationVectors;
  }

  resolveCameraZ(heights: CameraHeights): number {
    if (this.#animState === 'selector') {
      const count = this.#selector?.dice?.length || 1;
      return count > 9
        ? heights.far
        : count < 6
          ? heights.close
          : heights.medium;
    }
    return heights.far;
  }

  vectorRand(vector: Vector2D): Vector2D {
    return this.deps.planner.vectorRand(vector);
  }

  getNotationVectors(notation: string, vector: Vector2D, boost: number, dist: number): ParsedNotation {
    const parsed = this.deps.parser.parse(notation);
    this.#dieIndex = this.deps.planner.plan(parsed, vector, boost, dist, this.#dieIndex);
    return parsed;
  }

  startClickThrow(notation: string): ParsedNotation {
    if (this.#rolling) {
      this.clearDice();
      this.#rolling = false;
    }

    const display = this.deps.getDisplay();
    const vector = {
      x: (Math.random() * 2 - 0.5) * display.currentWidth,
      y: -(Math.random() * 2 - 0.5) * display.currentHeight,
    };
    const dist = Math.sqrt(vector.x * vector.x + vector.y * vector.y) + 100;
    const boost = (Math.random() + 3) * dist * this.deps.getConfig().strength;

    return this.getNotationVectors(notation, vector, boost, dist);
  }

  async showSelector(dice: SelectorDie[] = ['d20']): Promise<void> {
    this.clearDice();
    this.#rolling = false;
    this.#animState = 'selector';
    this.#selector = { dice: dice.map((d) => (typeof d === 'string' ? d : d.type)) };
    this.deps.relayout();

    const threadid = ++this.#threadId;

    for (const diceItem of dice) {
      const type = typeof diceItem === 'string' ? diceItem : diceItem.type;
      const style = typeof diceItem === 'string' ? undefined : diceItem.style;
      const vector = createEmptyThrowVector(type);
      vector.style = style;
      await this.deps.spawner.spawn(vector);
    }

    const frame = () => {
      if (this.deps.isDisposed() || threadid !== this.#threadId || this.#animState !== 'selector') return;

      const spacing = 100;
      const totalDice = this.deps.spawner.dice.length;
      const startX = -((totalDice - 1) * spacing) / 2;

      this.deps.spawner.dice.forEach((die, index) => {
        if (die) {
          die.rotation.y += 0.01;
          die.rotation.x += 0.005;
          const xPos = startX + index * spacing;
          die.position.set(xPos, 0, 0);
        }
      });

      this.deps.renderFrame();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  clearDice(): void {
    this.#threadId++;
    this.#animState = 'idle';
    this.deps.spawner.removeAll();
    this.deps.clearSelection();
    this.deps.physics.clear();
    this.deps.renderFrame();
  }

  clear(): void {
    this.#rollToken++;
    this.#rolling = false;
    this.clearDice();
  }

  cancel(): void {
    if (!this.#rolling && this.#animState === 'idle') return;
    this.#rollToken++;
    this.#rolling = false;
    this.clearDice();
    this.deps.bus.emit('roll:cancel', { id: this.#currentRollId || undefined });
  }

  async roll(notationString: string | string[]): Promise<RollResult> {
    const notation = Array.isArray(notationString) ? notationString.join('+') : notationString;
    const token = ++this.#rollToken;
    return this.deps.queue.enqueue(async () => {
      this.#assertActive(token);
      return this.#rollNow(notation, token);
    });
  }

  async #rollNow(notation: string, token: number): Promise<RollResult> {
    this.#currentRollId = newId();
    this.deps.bus.emit('roll:start', { id: this.#currentRollId, notation });
    this.#notationVectors = this.startClickThrow(notation);
    if (!this.#notationVectors) {
      throw new Error('Invalid notation');
    }
    await this.rollDice(token);
    const results = this.getDiceResults();
    this.deps.bus.emit('roll:finish', results);
    return results;
  }

  async reroll(diceIdArray: number[]): Promise<DieResult[]> {
    const token = ++this.#rollToken;
    return this.deps.queue.enqueue(async () => {
      this.#assertActive(token);
      this.#rolling = true;
      const threadid = ++this.#threadId;
      this.#iteration = 0;

      diceIdArray.forEach((dieId) => {
        const dicemesh = this.deps.spawner.dice[dieId];
        if (!dicemesh) return;
        dicemesh.rerolls += 1;
        dicemesh.rerolling = true;
      });
      await this.deps.physics.tossReroll(diceIdArray);
      this.#assertActive(token);

      await this.#animateThrow(threadid, token);
      return diceIdArray.map((dieId) => this.getDiceResults(dieId));
    });
  }

  async add(notationString: string): Promise<DieResult[] | RollResult> {
    const token = ++this.#rollToken;
    return this.deps.queue.enqueue(async () => {
      this.#assertActive(token);
      const dice = this.deps.spawner.dice;
      const dieCount = dice.length;
      if (!dieCount) {
        return this.#rollNow(notationString, token);
      }

      const addNotationVectors = this.startClickThrow(notationString);
      const diceIdArray: number[] = [];

      for (let i = 0, len = addNotationVectors.vectors.length; i < len; ++i) {
        this.#assertActive(token);
        await this.deps.spawner.spawn(addNotationVectors.vectors[i]);
        diceIdArray.push(dieCount + i);
      }

      const payloads = this.deps.physics
        .buildSpawnPayloads(dice, this.deps.shapes)
        .filter((p) => diceIdArray.includes(p.index));
      await this.deps.physics.spawnBatch(payloads);
      await this.#simulateThrow(token);

      await this.deps.physics.spawnBatch(payloads);
      this.deps.physics.resetMeshesToInitial(payloads, dice);

      if (addNotationVectors.result && addNotationVectors.result.length > 0) {
        for (let i = 0; i < addNotationVectors.result.length; i++) {
          const index = dieCount + i;
          const dicemesh = dice[index];
          if (!dicemesh) continue;
          if (Number(dicemesh.getLastValue().value) == Number(addNotationVectors.result[i])) continue;
          await this.deps.swapFace(dicemesh, Number(addNotationVectors.result[i]));
        }
      }

      this.#notationVectors = this.#notationVectors
        ? this.deps.parser.merge(this.#notationVectors, addNotationVectors)
        : addNotationVectors;

      const threadid = ++this.#threadId;
      this.#rolling = true;
      await this.#animateThrow(threadid, token);
      return diceIdArray.map((dieId) => this.getDiceResults(dieId));
    });
  }

  async remove(diceIdArray: number[]): Promise<DieResult[]> {
    const results: DieResult[] = [];
    const dice = this.deps.spawner.dice;
    for (const dieId of diceIdArray) {
      const mesh = dice[dieId];
      if (!mesh) continue;
      this.deps.spawner.detach(mesh);
      mesh.storeRolledValue('remove');
      results.push(this.getDiceResults(dieId));
    }
    await this.deps.physics.remove(diceIdArray);
    this.deps.renderFrame();
    return results;
  }

  async rollDice(token: number): Promise<void> {
    const notationVectors = this.#notationVectors;
    if (!notationVectors || notationVectors.error) {
      return;
    }

    this.clearDice();

    for (let i = 0, len = notationVectors.vectors.length; i < len; ++i) {
      this.#assertActive(token);
      await this.deps.spawner.spawn(notationVectors.vectors[i]);
    }

    const dice = this.deps.spawner.dice;
    const payloads = this.deps.physics.buildSpawnPayloads(dice, this.deps.shapes);
    await this.deps.physics.spawnBatch(payloads);
    await this.#simulateThrow(token);

    await this.deps.physics.spawnBatch(payloads);
    this.deps.physics.resetMeshesToInitial(payloads, dice);

    if (notationVectors.result && notationVectors.result.length > 0) {
      for (let i = 0; i < notationVectors.result.length; i++) {
        const dicemesh = dice[i];
        if (!dicemesh) continue;
        if (Number(dicemesh.getLastValue().value) == Number(notationVectors.result[i])) continue;
        await this.deps.swapFace(dicemesh, Number(notationVectors.result[i]));
      }
    }

    this.#rolling = true;
    const threadid = ++this.#threadId;
    this.#iteration = 0;
    await this.#animateThrow(threadid, token);
  }

  getDiceResults(): RollResult;
  getDiceResults(id: number): DieResult;
  getDiceResults(id?: number): RollResult | DieResult {
    const dice = this.deps.spawner.dice;
    if (id !== undefined) {
      const die = dice[id];
      if (!die) {
        return { type: '', sides: 0, id, value: 0, label: '', reason: '' };
      }
      const last = die.result?.at(-1);
      return {
        type: die.shape,
        sides: parseInt(die.shape.substring(1)),
        id,
        ...last,
        value: last?.value ?? 0,
        label: last?.label ?? '',
        reason: last?.reason ?? '',
      };
    }
    let counter = 0;
    const notationVectors = this.#notationVectors;
    const modifier = notationVectors?.constant
      ? parseInt(`${notationVectors.op}${notationVectors.constant}`)
      : 0;
    let rollTotal = modifier;
    return {
      id: this.#currentRollId,
      notation: notationVectors?.notation ?? '',
      sets: (notationVectors?.set ?? []).map((set) => {
        const endCount = counter + set.num - 1;
        let setTotal = 0;
        const rolls: DieResult[] = [];
        for (let index = counter; index <= endCount; index++) {
          const die = dice[counter];
          const lastValue = die?.result?.at(-1);
          if (!lastValue) {
            counter++;
            continue;
          }
          if (lastValue.reason === 'remove') {
            counter++;
            continue;
          }
          rolls.push({
            type: set.type,
            sides: parseInt(set.type.substring(1)),
            id: counter,
            ...lastValue,
            value: lastValue.value ?? 0,
          });
          setTotal += lastValue.value ?? 0;
          counter++;
        }
        rollTotal += setTotal;
        return {
          num: set.num,
          type: set.type,
          sides: parseInt(set.type.substring(1)),
          rolls,
          total: setTotal,
        };
      }),
      modifier,
      total: rollTotal,
    };
  }

  #checkForRethrow(dicemesh: DiceMesh): boolean {
    const func = dicemesh.notation.func?.toLowerCase() || '';
    if (!func) return false;
    const ctx = { die: dicemesh, func, args: dicemesh.notation.args || '' } as RerollContext;
    return (this.deps.bus.call('shouldReroll', ctx) as unknown) === true;
  }

  #evaluateThrow(forcedFinish: boolean): { finished: boolean; rethrow: number[] } {
    const rethrow: number[] = [];
    const dice = this.deps.spawner.dice;

    for (let i = 0; i < dice.length; i++) {
      const dicemesh = dice[i];
      if (!dicemesh?.body) continue;

      if (dicemesh.body.sleepState < BODY_SLEEP_STATE && !forcedFinish) {
        return { finished: false, rethrow: [] };
      }
      if (dicemesh.body.sleepState !== BODY_SLEEP_STATE && !forcedFinish) {
        continue;
      }

      if (dicemesh.result.length === 0) {
        dicemesh.storeRolledValue(dicemesh.resultReason);
      } else if (dicemesh.result.length > 0 && dicemesh.rerolling) {
        dicemesh.rerolling = false;
        dicemesh.storeRolledValue('reroll');
      }

      if (this.#checkForRethrow(dicemesh)) {
        dicemesh.rerolls += 1;
        dicemesh.rerolling = true;
        rethrow.push(i);
      }
    }

    return { finished: true, rethrow };
  }

  #assertActive(token: number): void {
    if (this.deps.isDisposed() || token !== this.#rollToken) {
      throw new RollCancelledError();
    }
  }

  async #simulateThrow(token: number): Promise<void> {
    this.#animState = 'simulate';
    this.#iteration = 0;
    this.#rolling = true;

    for (;;) {
      this.#assertActive(token);
      const result = await this.deps.physics.simulate(this.deps.getConfig().iterationLimit);
      this.deps.physics.applyStates(result.states, this.deps.spawner.dice);

      const evaluation = this.#evaluateThrow(true);
      if (evaluation.rethrow.length > 0) {
        await this.deps.physics.tossReroll(evaluation.rethrow);
        continue;
      }
      break;
    }
    this.#animState = 'throw';
  }

  async #animateThrow(threadid: number, token: number): Promise<void> {
    this.#animState = 'throw';
    const thread = threadid;
    let lastTime: number | null = null;

    return new Promise<void>((resolve, reject) => {
      const frame = async () => {
        try {
          if (this.deps.isDisposed() || thread !== this.#threadId || token !== this.#rollToken) {
            reject(new RollCancelledError());
            return;
          }

          const config = this.deps.getConfig();
          const now = performance.now();
          if (lastTime === null) lastTime = now - config.timestep * 1000;
          const timeDiff = (now - lastTime) / 1000;
          this.#iteration++;
          const neededSteps = Math.min(Math.floor(timeDiff / config.timestep), 5);

          let stepResult: StepResult | null = null;
          if (neededSteps > 0) {
            stepResult = await this.deps.physics.step(neededSteps);
            lastTime = lastTime + neededSteps * config.timestep * 1000;
            this.#assertActive(token);
            this.deps.physics.applyStates(stepResult.states, this.deps.spawner.dice);
            this.deps.sounds.playCollideEvents(stepResult.collideEvents, this.#animState === 'simulate');
          }

          this.deps.renderFrame();

          const forcedFinish = this.#iteration > config.iterationLimit;
          const allAsleep = stepResult?.allAsleep ?? false;

          if (allAsleep || forcedFinish) {
            const evaluation = this.#evaluateThrow(forcedFinish);
            if (!evaluation.finished) {
              requestAnimationFrame(frame);
              return;
            }
            if (evaluation.rethrow.length > 0) {
              await this.deps.physics.tossReroll(evaluation.rethrow);
              this.#assertActive(token);
              requestAnimationFrame(frame);
              return;
            }

            this.deps.physics.markAllKinematic(this.deps.spawner.dice);
            this.#rolling = false;
            this.#animState = 'afterthrow';
            resolve();
            return;
          }

          requestAnimationFrame(frame);
        } catch (error) {
          reject(error);
        }
      };
      requestAnimationFrame(frame);
    });
  }

  interrupt(): void {
    this.#rollToken++;
    this.#threadId++;
    this.#rolling = false;
    this.#animState = 'idle';
  }
}
