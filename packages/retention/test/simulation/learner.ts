/**
 * A simulated learner for time-simulation tests.
 *
 * The learner's true memory is NOT the scheduler's model. Each item belongs to a
 * hidden difficulty class with its own FSRS weights (different initial stability and
 * stability growth from the defaults the scheduler uses), so the scheduler has to
 * adapt from observed answers alone, as it will with real users. These parameters
 * are assumptions chosen to stress the scheduler, not measurements of real fans;
 * revisit them once real review logs exist.
 */
import type { Grade, ItemId } from '@ball-knowledge/core';
import {
  default_w,
  forgetting_curve,
  fsrs,
  Rating,
  State,
  createEmptyCard,
  type Card,
  type FSRS,
} from 'ts-fsrs';
import { DAY_MS, type Rng } from '../../src/index';

export type DifficultyClass = 'easy' | 'normal' | 'hard';

/** How each class differs from the scheduler's default model. */
const CLASS_SHAPE: Record<DifficultyClass, { initialStability: number; growth: number }> = {
  easy: { initialStability: 1.5, growth: +0.2 },
  normal: { initialStability: 1.0, growth: 0 },
  hard: { initialStability: 0.5, growth: -0.3 },
};

export interface LearnerProfile {
  readonly name: string;
  /** Share of items in each hidden difficulty class. */
  readonly mix: Readonly<Record<DifficultyClass, number>>;
}

export const TYPICAL_LEARNER: LearnerProfile = {
  name: 'typical',
  mix: { easy: 0.25, normal: 0.5, hard: 0.25 },
};

/** Pessimistic: most facts are harder for this learner than the default model assumes. */
export const FORGETFUL_LEARNER: LearnerProfile = {
  name: 'forgetful',
  mix: { easy: 0.1, normal: 0.4, hard: 0.5 },
};

/** Chance of answering right immediately after being taught something new. */
const RECALL_RIGHT_AFTER_TEACHING = 0.95;
/** Below this true recall probability, a correct answer is slow and effortful ("hard"). */
const EFFORTFUL_RECALL = 0.5;

const RATING: Record<Grade, Rating.Again | Rating.Hard | Rating.Good | Rating.Easy> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

interface HiddenMemory {
  readonly cls: DifficultyClass;
  card: Card;
}

export class SimulatedLearner {
  private readonly engines: Record<DifficultyClass, { engine: FSRS; w: readonly number[] }>;
  private readonly memory = new Map<ItemId, HiddenMemory>();

  constructor(
    private readonly profile: LearnerProfile,
    private readonly rng: Rng,
  ) {
    const make = (cls: DifficultyClass) => {
      const shape = CLASS_SHAPE[cls];
      const w = [...default_w];
      for (let i = 0; i < 4; i++) w[i] = w[i]! * shape.initialStability;
      w[8] = w[8]! + shape.growth;
      const engine = fsrs({ w, enable_fuzz: false, enable_short_term: true });
      return { engine, w: engine.parameters.w };
    };
    this.engines = { easy: make('easy'), normal: make('normal'), hard: make('hard') };
  }

  private memoryFor(id: ItemId, now: Date): HiddenMemory {
    let m = this.memory.get(id);
    if (!m) {
      const roll = this.rng();
      const { easy, normal } = this.profile.mix;
      const cls: DifficultyClass = roll < easy ? 'easy' : roll < easy + normal ? 'normal' : 'hard';
      m = { cls, card: createEmptyCard(now) };
      this.memory.set(id, m);
    }
    return m;
  }

  /** The learner's true probability of recalling the item at `now` (no side effects). */
  recallProbability(id: ItemId, now: Date, daysAhead = 0): number {
    const m = this.memory.get(id);
    if (!m || m.card.state === State.New || !m.card.last_review) return RECALL_RIGHT_AFTER_TEACHING;
    const elapsed = (now.getTime() - m.card.last_review.getTime()) / DAY_MS + daysAhead;
    return forgetting_curve(this.engines[m.cls].w, Math.max(0, elapsed), m.card.stability);
  }

  /** Answers a question about the item and updates the learner's true memory. */
  answer(id: ItemId, now: Date): Grade {
    const m = this.memoryFor(id, now);
    const p = this.recallProbability(id, now);
    const grade: Grade = this.rng() < p ? (p < EFFORTFUL_RECALL ? 'hard' : 'good') : 'again';
    m.card = this.engines[m.cls].engine.next(m.card, now, RATING[grade]).card;
    return grade;
  }
}
