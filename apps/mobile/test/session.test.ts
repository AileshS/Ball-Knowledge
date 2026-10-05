import {
  MemoryTipSchema,
  type Exercise,
  type ItemId,
  type LessonId,
  type UserItemState,
} from '@ball-knowledge/core';
import { createScheduler, createSeededRng, DAY_MS } from '@ball-knowledge/retention';
import { describe, expect, it } from 'vitest';
import type { AppContent } from '../src/content/bundle';
import { MemoryStore } from '../src/progress/store';
import {
  acceptedAnswers,
  checkMatch,
  checkTimeline,
  checkTyped,
  editDistance,
  normalizeAnswer,
  wrongOptions,
} from '../src/session/answers';
import { advanceClock, createClock, loadClockOffset } from '../src/session/clock';
import {
  exerciseForItem,
  planLesson,
  planReview,
  questionFor,
  requeueIfMissed,
  reviewableStates,
  shuffled,
  type QuestionStep,
} from '../src/session/plan';
import { correctAnswerText, feedbackFor, scoreAnswer } from '../src/session/scoring';
import { startOfLocalDay, todaySummary } from '../src/session/today';
import { fixtureExercise, fixtureItem } from '@ball-knowledge/core/testing';
import { repoContent } from './helpers';

const scheduler = createScheduler();
const content: AppContent = repoContent();
const rng = () => createSeededRng(7);
const T = new Date('2026-10-03T15:00:00Z');
const ex = (id: string) => {
  const e = content.exercisesById.get(id);
  if (!e) throw new Error(`missing ${id}`);
  return e;
};
const noStates = new Map<ItemId, UserItemState>();

describe('answer checking', () => {
  it('normalizes case, punctuation, spacing, and a leading article', () => {
    expect(normalizeAnswer('  The  End-Zone! ')).toBe('end zone');
    expect(normalizeAnswer('A safety')).toBe('safety');
  });

  it('accepts exact answers, alternates, and small typos in words but never in numbers', () => {
    const answers = acceptedAnswers(ex('nfl.ex.scoring.recall-three-points'));
    expect(checkTyped('field goal', answers)).toBe('exact');
    expect(checkTyped('FG', answers)).toBe('exact');
    expect(checkTyped('feild goal', answers)).toBe('typo');
    expect(checkTyped('touchdown', answers)).toBe('wrong');
    expect(checkTyped('   ', answers)).toBe('wrong');
    expect(checkTyped('six', ['6', 'six'])).toBe('exact');
    expect(checkTyped('7', ['6'])).toBe('wrong');
    expect(checkTyped('3600', ['360'])).toBe('wrong');
  });

  it('measures edit distance with a cap', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('saftey', 'safety')).toBe(1);
    expect(editDistance('ab', 'ba')).toBe(1);
    expect(editDistance('a', 'abcdefgh', 2)).toBe(3);
    expect(acceptedAnswers(ex('nfl.ex.scoring.match-values'))).toEqual([]);
  });

  it('checks matches and timelines', () => {
    const match = ex('nfl.ex.scoring.match-values');
    if (match.type !== 'match') throw new Error('expected match');
    const right = new Map(match.pairs.map((p) => [p.left, p.right]));
    expect(checkMatch(match, right)).toBe(true);
    expect(checkMatch(match, new Map(right).set('Touchdown', '3 points'))).toBe(false);

    const timeline = {
      type: 'timeline_order',
      events: [{ label: 'One' }, { label: 'Two' }, { label: 'Three' }],
    } as Extract<Exercise, { type: 'timeline_order' }>;
    expect(checkTimeline(timeline, ['One', 'Two', 'Three'])).toBe(true);
    expect(checkTimeline(timeline, ['Two', 'One', 'Three'])).toBe(false);
    expect(checkTimeline(timeline, ['One', 'Two'])).toBe(false);
  });
});

describe('questionFor', () => {
  it('asks new items as recognition with shuffled options', () => {
    const q = questionFor(
      ex('nfl.ex.scoring.touchdown-points'),
      'learn',
      noStates,
      scheduler,
      rng(),
      'k',
    );
    expect(q.format).toBe('choice');
    expect([...q.options].sort()).toEqual(['3', '6', '7']);
  });

  it('makes recall checks typed', () => {
    const q = questionFor(
      ex('nfl.ex.scoring.touchdown-points'),
      'recall',
      noStates,
      scheduler,
      rng(),
      'k',
    );
    expect(q).toMatchObject({ format: 'typed', options: [] });
  });

  it('switches to typed recall once an item is familiar', () => {
    const itemId = 'nfl.rules.touchdown-points' as ItemId;
    const familiar = {
      ...scheduler.newItemState(itemId, T),
      phase: 'review' as const,
      reps: 4,
      stability: 10,
      lastReviewedAt: T,
    };
    const q = questionFor(
      ex('nfl.ex.scoring.touchdown-points'),
      'review',
      new Map([[itemId, familiar]]),
      scheduler,
      rng(),
      'k',
    );
    expect(q.format).toBe('typed');
  });

  it('keeps structured formats and never presents a match already solved', () => {
    const match = questionFor(
      ex('nfl.ex.scoring.match-values'),
      'learn',
      noStates,
      scheduler,
      () => 0.99,
      'k',
    );
    expect(match.format).toBe('match');
    expect(match.options).not.toEqual(['6 points', '3 points', '2 points']);
    const hl = questionFor(
      ex('nfl.ex.scoring.field-goal-vs-safety'),
      'learn',
      noStates,
      scheduler,
      rng(),
      'k',
    );
    expect(hl).toMatchObject({ format: 'higher_lower', options: ['Field goal', 'Safety'] });
  });

  it('shuffles deterministically for a seed', () => {
    expect(shuffled([1, 2, 3, 4, 5], createSeededRng(3))).toEqual(
      shuffled([1, 2, 3, 4, 5], createSeededRng(3)),
    );
  });
});

describe('planLesson', () => {
  const lesson = (id: string) => content.lessonsById.get(id)!;

  it('runs learn cards, then teaching questions, then a typed recall check', () => {
    const steps = planLesson({
      content,
      lesson: lesson('nfl.lesson.how-teams-score'),
      states: noStates,
      scheduler,
      now: T,
      rng: rng(),
    });
    const kinds = steps.map((s) => (s.kind === 'question' ? s.phase : s.kind));
    expect(kinds).toEqual([
      'learn',
      'learn',
      'learn',
      'learn',
      'learn',
      'learn',
      'learn',
      'learn',
      'learn',
      'learn',
      'learn',
      'recall',
      'recall',
      'recall',
    ]);
    expect(steps.slice(0, 4).every((s) => s.kind === 'learn')).toBe(true);
    const recall = steps.filter(
      (s): s is QuestionStep => s.kind === 'question' && s.phase === 'recall',
    );
    expect(recall.every((q) => q.format === 'typed')).toBe(true);
  });

  it('opens the next lesson with callbacks to what was learned', () => {
    const first = lesson('nfl.lesson.how-teams-score');
    const states = new Map<ItemId, UserItemState>();
    for (const id of first.introducesItemIds) {
      const result = scheduler.applyReview(scheduler.newItemState(id, T), {
        grade: 'good',
        now: T,
        cue: 'stat',
        exerciseType: 'multiple_choice',
        context: 'lesson',
      });
      states.set(id, result.state);
    }
    const steps = planLesson({
      content,
      lesson: lesson('nfl.lesson.field-and-the-try'),
      states,
      scheduler,
      now: new Date(T.getTime() + 2 * DAY_MS),
      rng: rng(),
    });
    const callbacks = steps.filter(
      (s): s is QuestionStep => s.kind === 'question' && s.phase === 'callback',
    );
    expect(callbacks).toHaveLength(2);
    for (const c of callbacks) expect(first.introducesItemIds).toContain(c.itemIds[0]);
    expect(steps[0]?.kind).toBe('question');
  });

  it('shows a lesson memory tip after the learn cards', () => {
    const base = lesson('nfl.lesson.how-teams-score');
    const tip = MemoryTipSchema.parse({
      id: 'nfl.tip.fixture',
      sportId: 'nfl',
      technique: 'acronym',
      itemIds: base.introducesItemIds.slice(0, 2),
      title: 'Fictional tip',
      body: 'Fictional body.',
      reviewStatus: 'approved',
    });
    const withTip: AppContent = { ...content, tipsById: new Map([[tip.id, tip]]) };
    const steps = planLesson({
      content: withTip,
      lesson: { ...base, memoryTipIds: [tip.id] },
      states: noStates,
      scheduler,
      now: T,
      rng: rng(),
    });
    expect(steps[4]).toMatchObject({ kind: 'tip', title: 'Fictional tip' });
  });
});

describe('review planning and re-asking', () => {
  it('picks one question per item, preferring single-item exercises', () => {
    const items = ['nfl.rules.touchdown-points', 'nfl.rules.field-size'] as ItemId[];
    const steps = planReview(content, items, noStates, scheduler, rng());
    expect(steps.map((s) => s.itemIds)).toEqual([[items[0]], [items[1]]]);
    expect(steps.every((s) => s.phase === 'review')).toBe(true);
    expect(planReview(content, ['nfl.rules.nope' as ItemId], noStates, scheduler, rng())).toEqual(
      [],
    );
  });

  it('rotates to the cue used least recently', () => {
    const id = 'nfl.rules.end-zones' as ItemId;
    const usedStat = { ...scheduler.newItemState(id, T), cueHistory: ['stat' as const] };
    expect(exerciseForItem(content, id, usedStat)?.cue).toBe('name');
    expect(
      exerciseForItem(content, id, undefined, new Set(content.exercises.map((e) => e.id))),
    ).toBeUndefined();
  });

  it('re-asks a missed review question once, at the end', () => {
    const steps = planReview(
      content,
      ['nfl.rules.touchdown-points'] as ItemId[],
      noStates,
      scheduler,
      rng(),
    );
    const missed = requeueIfMissed(steps, 0, false);
    expect(missed).toHaveLength(2);
    expect((missed[1] as QuestionStep).key).toBe('review:nfl.rules.touchdown-points:again');
    expect(requeueIfMissed(missed, 1, false)).toHaveLength(2);
    expect(requeueIfMissed(steps, 0, true)).toHaveLength(1);
    const lessonSteps = planLesson({
      content,
      lesson: content.lessonsById.get('nfl.lesson.how-teams-score')!,
      states: noStates,
      scheduler,
      now: T,
      rng: rng(),
    });
    expect(requeueIfMissed(lessonSteps, 5, false)).toHaveLength(lessonSteps.length);
  });
});

describe('scoring and feedback', () => {
  const step = (
    format: QuestionStep['format'],
    phase: QuestionStep['phase'] = 'learn',
  ): QuestionStep => ({
    kind: 'question',
    key: 'k',
    phase,
    exerciseId: 'nfl.ex.scoring.touchdown-points',
    itemIds: ['nfl.rules.touchdown-points' as ItemId],
    format,
    options: [],
  });

  it('applies the grade to each tested item with the right context', () => {
    const scored = scoreAnswer(
      scheduler,
      noStates,
      step('choice'),
      ex('nfl.ex.scoring.touchdown-points'),
      { correct: true, responseMs: 2000 },
      T,
    );
    expect(scored.grade).toBe('good');
    expect(scored.results[0]?.logEntry).toMatchObject({
      context: 'lesson',
      correct: true,
      cue: 'stat',
      exerciseType: 'multiple_choice',
    });

    const typedFast = scoreAnswer(
      scheduler,
      noStates,
      step('typed', 'recall'),
      ex('nfl.ex.scoring.touchdown-points'),
      { correct: true, responseMs: 1500 },
      T,
    );
    expect(typedFast.grade).toBe('easy');
    expect(typedFast.results[0]?.logEntry.context).toBe('recall_check');

    const typo = scoreAnswer(
      scheduler,
      noStates,
      step('typed'),
      ex('nfl.ex.scoring.touchdown-points'),
      { correct: true, typo: true },
      T,
    );
    expect(typo.grade).toBe('hard');

    const missed = scoreAnswer(
      scheduler,
      noStates,
      step('choice', 'review'),
      ex('nfl.ex.scoring.touchdown-points'),
      { correct: false },
      T,
    );
    expect(missed.grade).toBe('again');
  });

  it('never time-stamps an answer before the last review of the item (fast clock elsewhere)', () => {
    const itemId = 'nfl.rules.touchdown-points' as ItemId;
    const future = new Date(T.getTime() + 5 * 60_000);
    const synced = scheduler.applyReview(scheduler.newItemState(itemId, future), {
      grade: 'good',
      now: future,
      cue: 'stat',
      exerciseType: 'identify',
      context: 'review',
    }).state;
    const scored = scoreAnswer(
      scheduler,
      new Map([[itemId, synced]]),
      step('choice'),
      ex('nfl.ex.scoring.touchdown-points'),
      { correct: true },
      T,
    );
    expect(scored.results[0]?.logEntry.reviewedAt.getTime()).toBe(future.getTime() + 1);
  });

  it('shows the answer and why it matters, plus tips only after a miss', () => {
    const e = ex('nfl.ex.scoring.touchdown-points');
    const tip = MemoryTipSchema.parse({
      id: 'nfl.tip.story',
      sportId: 'nfl',
      technique: 'story',
      itemIds: [...e.itemIds, 'nfl.rules.safety-points'],
      title: 'Tip',
      body: 'Body',
      reviewStatus: 'approved',
    });
    const withTip: AppContent = { ...content, tips: [tip, tip] };
    const miss = feedbackFor(withTip, e, false);
    expect(miss.answer).toBe('6');
    expect(miss.why[0]).toMatch(/biggest single score/);
    expect(miss.tips).toEqual([{ id: 'nfl.tip.story', title: 'Tip', body: 'Body' }]);
    expect(feedbackFor(withTip, e, true).tips).toEqual([]);
  });

  it('formats answers for every exercise type', () => {
    expect(correctAnswerText(ex('nfl.ex.scoring.match-values'))).toContain('Touchdown → 6 points');
    expect(correctAnswerText(ex('nfl.ex.scoring.field-goal-vs-safety'))).toMatch(/3 points/);
    const noExplanation = {
      ...ex('nfl.ex.scoring.field-goal-vs-safety'),
      explanation: undefined,
    } as Exercise;
    expect(correctAnswerText(noExplanation)).toBe('Field goal');
    const timeline = {
      type: 'timeline_order',
      events: [{ label: 'One' }, { label: 'Two' }],
    } as Exercise;
    expect(correctAnswerText(timeline)).toBe('1. One\n2. Two');
  });
});

describe('todaySummary', () => {
  const dayStart = startOfLocalDay(T);
  const base = {
    content,
    sportId: 'nfl',
    states: noStates,
    completedLessons: new Map<string, string>(),
    log: [],
    scheduler,
    now: T,
    dayStart,
  };

  it('offers the first lesson when nothing is due', () => {
    expect(todaySummary(base)).toMatchObject({
      reviewItemIds: [],
      caughtUp: true,
      nextLesson: { id: 'nfl.lesson.how-teams-score' },
    });
  });

  it('keeps offering the next lesson after one is done today (no daily stop, ADR 0006)', () => {
    const today = todaySummary({
      ...base,
      completedLessons: new Map([['nfl.lesson.how-teams-score', T.toISOString()]]),
    });
    expect(today).toMatchObject({
      lessonsDoneToday: 1,
      nextLesson: { id: 'nfl.lesson.field-and-the-try' },
    });
    expect(today).not.toHaveProperty('done');
  });

  it('lists every due fact with no daily cap, and counts reviews done today', () => {
    const states = new Map<ItemId, UserItemState>();
    const learnedAt = new Date('2026-09-01T09:00:00Z');
    for (const item of content.items) {
      const r = scheduler.applyReview(scheduler.newItemState(item.id, learnedAt), {
        grade: 'good',
        now: learnedAt,
        cue: 'stat',
        exerciseType: 'multiple_choice',
        context: 'lesson',
      });
      states.set(item.id, r.state);
    }
    const tiny = createScheduler({ ...scheduler.config, maxDailyReviews: 2 });
    const due = todaySummary({ ...base, states, scheduler: tiny });
    expect(due.reviewItemIds).toHaveLength(content.items.length);
    expect(due.caughtUp).toBe(false);

    const [first] = content.items;
    const reviewed = scheduler.applyReview(states.get(first!.id)!, {
      grade: 'good',
      now: T,
      cue: 'stat',
      exerciseType: 'identify',
      context: 'review',
    });
    const after = todaySummary({
      ...base,
      states: new Map(states).set(first!.id, reviewed.state),
      log: [reviewed.logEntry],
    });
    expect(after.reviewsDoneToday).toBe(1);
    expect(after.reviewItemIds).not.toContain(first!.id);
  });

  it('reports no next lesson once every lesson is done', () => {
    const all = new Map(content.lessons.map((l) => [l.id, T.toISOString()] as const));
    expect(todaySummary({ ...base, completedLessons: all }).nextLesson).toBeNull();
  });

  it('computes the local day start', () => {
    const d = startOfLocalDay(new Date(2026, 9, 3, 18, 30));
    expect([d.getHours(), d.getMinutes(), d.getDate()]).toEqual([0, 0, 3]);
  });
});

describe('dev clock', () => {
  it('adds a forward-only offset', async () => {
    const store = new MemoryStore();
    expect(await loadClockOffset(store)).toBe(0);
    expect(await advanceClock(store, 1)).toBe(1);
    expect(await advanceClock(store, 7)).toBe(8);
    await expect(advanceClock(store, -1)).rejects.toThrow(RangeError);
    await expect(advanceClock(store, 0.5)).rejects.toThrow(RangeError);
    await store.set('bk:dev:clockOffsetDays', 'garbage');
    expect(await loadClockOffset(store)).toBe(0);
    const clock = createClock(2, () => T.getTime());
    expect(clock.now().getTime()).toBe(T.getTime() + 2 * DAY_MS);
    expect(createClock(0).now()).toBeInstanceOf(Date);
  });
});

describe('lesson ids', () => {
  it('are branded strings', () => {
    const id: LessonId = 'nfl.lesson.how-teams-score' as LessonId;
    expect(content.lessonsById.has(id)).toBe(true);
  });
});

describe('review fixes: sports stay separate, stale states never get stuck', () => {
  const nbaItem = fixtureItem({ id: 'nba.fixture.item', sportId: 'nba' });
  const nbaExercise = fixtureExercise({ id: 'nba.fixture.ex', itemIds: ['nba.fixture.item'] });
  const mixed: AppContent = {
    ...content,
    items: [...content.items, nbaItem],
    exercises: [...content.exercises, nbaExercise],
    itemsById: new Map([...content.itemsById, [nbaItem.id, nbaItem]]),
    exercisesById: new Map([...content.exercisesById, [nbaExercise.id, nbaExercise]]),
  };
  const longAgo = new Date('2026-08-01T09:00:00Z');
  const learned = (id: string) =>
    scheduler.applyReview(scheduler.newItemState(id as ItemId, longAgo), {
      grade: 'good',
      now: longAgo,
      cue: 'name',
      exerciseType: 'multiple_choice',
      context: 'lesson',
    }).state;

  it('keeps another sport’s due facts and lessons out of today’s goal', () => {
    const states = new Map<ItemId, UserItemState>([
      [nbaItem.id, learned(nbaItem.id)],
      ['nfl.rules.removed-fact' as ItemId, learned('nfl.rules.removed-fact')],
    ]);
    const today = todaySummary({
      content: mixed,
      sportId: 'nfl',
      states,
      completedLessons: new Map([['nba.lesson.someday', T.toISOString()]]),
      log: [],
      scheduler,
      now: T,
      dayStart: startOfLocalDay(T),
    });
    expect(today.reviewItemIds).toEqual([]);
    expect(today.lessonsDoneToday).toBe(0);
    expect(reviewableStates(mixed, states, 'nba').has(nbaItem.id)).toBe(true);
    expect(reviewableStates(mixed, states, 'nfl').size).toBe(0);
  });

  it('opens a lesson with callbacks from the same sport only', () => {
    const first = content.lessonsById.get('nfl.lesson.how-teams-score')!;
    const states = new Map<ItemId, UserItemState>([[nbaItem.id, learned(nbaItem.id)]]);
    for (const id of first.introducesItemIds) states.set(id, learned(id));
    const steps = planLesson({
      content: mixed,
      lesson: content.lessonsById.get('nfl.lesson.field-and-the-try')!,
      states,
      scheduler,
      now: T,
      rng: rng(),
    });
    const callbackItems = steps.flatMap((s) =>
      s.kind === 'question' && s.phase === 'callback' ? s.itemIds : [],
    );
    expect(callbackItems).toHaveLength(2);
    expect(callbackItems).not.toContain(nbaItem.id);
  });

  it('never gives typo credit for a near-copy of a wrong option', () => {
    expect(checkTyped('safety', ['safety'], ['safeties'])).toBe('exact');
    expect(checkTyped('saftey', ['safety'], ['field goal'])).toBe('typo');
    expect(checkTyped('end lines', ['end line'], ['end lines'])).toBe('wrong');
    expect(checkTyped('goal lin', ['end line'], ['goal line'])).toBe('wrong');
    expect(wrongOptions(ex('nfl.ex.field.recall-crossbar'))).toEqual(['Goal line', 'Sideline']);
    expect(wrongOptions(ex('nfl.ex.scoring.match-values'))).toEqual([]);
  });
});
