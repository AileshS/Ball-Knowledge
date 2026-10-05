import type { Exercise, ItemId, UserItemState } from '@ball-knowledge/core';
import type { ReviewResult } from '@ball-knowledge/retention';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  checkMatch,
  checkTimeline,
  checkTyped,
  acceptedAnswers,
  normalizeAnswer,
  wrongOptions,
} from '../session/answers';
import { requeueIfMissed, type QuestionStep, type Step } from '../session/plan';
import { xpForAnswer } from '../rewards/xp';
import { feedbackFor, scoreAnswer, type Feedback } from '../session/scoring';
import { useAppState } from '../state/AppState';
import { Badge, Banner, Body, Card, Heading, ProgressBar, Row, Title } from './components';
import { Button, Field } from './controls';

export interface SessionSummary {
  readonly answered: number;
  readonly correct: number;
  /** XP earned this session (correct recall only). */
  readonly xp: number;
}

interface PlayerProps {
  readonly steps: readonly Step[];
  readonly startStates: ReadonlyMap<ItemId, UserItemState>;
  readonly onFinish: (summary: SessionSummary) => void;
  /**
   * Custom scoring (e.g. placement, where only correct answers count). Defaults to
   * the normal lesson/review scoring.
   */
  readonly score?: (
    step: QuestionStep,
    exercise: Exercise,
    correct: boolean,
    now: Date,
    states: ReadonlyMap<ItemId, UserItemState>,
  ) => readonly ReviewResult[];
  /** Told about every answer, e.g. to work out placement results. */
  readonly onAnswered?: (step: QuestionStep, correct: boolean) => void;
}

const PHASE_LABEL: Record<QuestionStep['phase'], string> = {
  callback: 'Warm-up',
  learn: 'Learn',
  recall: 'Recall check',
  review: 'Review',
  placement: 'Placement',
};

/**
 * Plays a session (lesson or review) one step at a time. Every answer is scored
 * and saved immediately, so leaving mid-session never loses what was answered.
 */
export function Player({
  steps: initialSteps,
  startStates,
  onFinish,
  score,
  onAnswered,
}: PlayerProps) {
  const { content, scheduler, clock, saveResults, savedTips, toggleSavedTip } = useAppState();
  const [steps, setSteps] = useState<readonly Step[]>(initialSteps);
  const [index, setIndex] = useState(0);
  const [states, setStates] = useState(startStates);
  const [feedback, setFeedback] = useState<(Feedback & { typo: boolean }) | null>(null);
  const [tally, setTally] = useState<SessionSummary>({ answered: 0, correct: 0, xp: 0 });
  const [saveError, setSaveError] = useState<string | null>(null);
  // When the current step appeared, for response times (set after render, not during it).
  const shownAt = useRef(0);

  const step = steps[index];
  useEffect(() => {
    shownAt.current = Date.now();
  }, [index]);
  /** Moves on; `nextSteps` may include a missed review question queued again. */
  const advance = (nextSteps: readonly Step[] = steps) => {
    setFeedback(null);
    setSteps(nextSteps);
    if (index + 1 >= nextSteps.length) onFinish(tally);
    else setIndex(index + 1);
  };

  const answer = (exercise: Exercise, q: QuestionStep, correct: boolean, typo = false) => {
    const now = clock.now();
    const results = score
      ? score(q, exercise, correct, now, states)
      : scoreAnswer(
          scheduler,
          states,
          q,
          exercise,
          { correct, typo, responseMs: Date.now() - shownAt.current },
          now,
        ).results;
    onAnswered?.(q, correct);
    const nextStates = new Map(states);
    results.forEach((r: ReviewResult) => nextStates.set(r.state.itemId, r.state));
    setStates(nextStates);
    saveResults(results).catch((e: unknown) =>
      setSaveError(e instanceof Error ? e.message : String(e)),
    );
    const xp = results.reduce(
      (sum, r) => sum + xpForAnswer(states.get(r.state.itemId), r.logEntry),
      0,
    );
    setTally((t) => ({
      answered: t.answered + 1,
      correct: t.correct + (correct ? 1 : 0),
      xp: t.xp + xp,
    }));
    setFeedback({ ...feedbackFor(content, exercise, correct), typo });
  };

  if (!step) return null;
  const position = `${Math.min(index + 1, steps.length)} of ${steps.length}`;

  return (
    <View style={{ gap: 12 }}>
      <ProgressBar value={index / steps.length} label={`Step ${position}`} />
      {saveError && <Banner>Couldn't save your answer: {saveError}</Banner>}

      {step.kind === 'learn' && (
        <Card>
          <Badge label="New fact" tone="primary" />
          <Heading>{step.label}</Heading>
          <Body>{step.statement}</Body>
          <Body muted>{step.whyItMatters}</Body>
          <Button label="Got it" onPress={() => advance()} />
        </Card>
      )}

      {step.kind === 'tip' && (
        <Card>
          <Badge label="Memory tip (optional)" tone="accent" />
          <Heading>{step.title}</Heading>
          <Body>{step.body}</Body>
          <Button label="Got it" onPress={() => advance()} />
          <SaveTipButton tipId={step.tipId} saved={savedTips} onToggle={toggleSavedTip} />
          <Button label="Skip tip" tone="secondary" onPress={() => advance()} />
        </Card>
      )}

      {step.kind === 'question' && (
        <Question
          key={step.key}
          step={step}
          exercise={content.exercisesById.get(step.exerciseId)}
          locked={feedback !== null}
          onAnswer={answer}
        />
      )}

      {feedback && (
        <Card>
          <Row>
            <Heading>
              {feedback.correct
                ? feedback.typo
                  ? 'Almost — watch the spelling'
                  : 'Correct!'
                : 'Not quite'}
            </Heading>
            <Badge
              label={feedback.correct ? 'Right' : 'Missed'}
              tone={feedback.correct ? 'primary' : 'warning'}
            />
          </Row>
          {(!feedback.correct || feedback.typo) && <Body>Answer: {feedback.answer}</Body>}
          {feedback.why.map((w) => (
            <Body key={w} muted>
              {w}
            </Body>
          ))}
          {feedback.tips.map((tip) => (
            <Card key={tip.title}>
              <Badge label="Memory tip" tone="accent" />
              <Body>{tip.title}</Body>
              <Body muted>{tip.body}</Body>
              <SaveTipButton tipId={tip.id} saved={savedTips} onToggle={toggleSavedTip} />
            </Card>
          ))}
          <Button
            label="Continue"
            onPress={() => advance(requeueIfMissed(steps, index, feedback.correct))}
          />
        </Card>
      )}
    </View>
  );
}

interface QuestionProps {
  readonly step: QuestionStep;
  readonly exercise: Exercise | undefined;
  readonly locked: boolean;
  readonly onAnswer: (
    exercise: Exercise,
    step: QuestionStep,
    correct: boolean,
    typo?: boolean,
  ) => void;
}

function Question({ step, exercise, locked, onAnswer }: QuestionProps) {
  const [typed, setTyped] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [matches, setMatches] = useState<ReadonlyMap<string, string>>(new Map());
  const [activeLeft, setActiveLeft] = useState<string | null>(null);

  if (!exercise) return <Banner>This question is missing from the content bundle.</Banner>;

  const header = (
    <>
      <Badge label={PHASE_LABEL[step.phase]} />
      <Heading>
        {exercise.textFallback && exercise.type === 'clip'
          ? exercise.textFallback
          : exercise.prompt}
      </Heading>
    </>
  );

  if (step.format === 'choice' && 'answer' in exercise) {
    const right = normalizeAnswer(exercise.answer);
    return (
      <Card>
        {header}
        {step.options.map((option) => {
          const isRight = normalizeAnswer(option) === right;
          const tone = !locked
            ? 'secondary'
            : isRight
              ? 'right'
              : option === picked
                ? 'wrong'
                : 'secondary';
          return (
            <Button
              key={option}
              label={option}
              tone={tone}
              disabled={locked}
              onPress={() => {
                setPicked(option);
                onAnswer(exercise, step, isRight);
              }}
            />
          );
        })}
      </Card>
    );
  }

  if (step.format === 'typed') {
    const submit = () => {
      if (locked || typed.trim() === '') return;
      const verdict = checkTyped(typed, acceptedAnswers(exercise), wrongOptions(exercise));
      onAnswer(exercise, step, verdict !== 'wrong', verdict === 'typo');
    };
    return (
      <Card>
        {header}
        <Field
          label="Your answer"
          value={typed}
          onChangeText={setTyped}
          onSubmit={submit}
          editable={!locked}
        />
        <Button label="Check" onPress={submit} disabled={locked || typed.trim() === ''} />
      </Card>
    );
  }

  if (step.format === 'higher_lower' && exercise.type === 'higher_lower') {
    const sides = [
      { label: exercise.left.label, side: 'left' as const },
      { label: exercise.right.label, side: 'right' as const },
    ];
    return (
      <Card>
        {header}
        <Body muted>Higher {exercise.metric.toLowerCase()}?</Body>
        {sides.map(({ label, side }) => (
          <Button
            key={side}
            label={label}
            tone={
              !locked
                ? 'secondary'
                : side === exercise.higher
                  ? 'right'
                  : picked === side
                    ? 'wrong'
                    : 'secondary'
            }
            disabled={locked}
            onPress={() => {
              setPicked(side);
              onAnswer(exercise, step, side === exercise.higher);
            }}
          />
        ))}
      </Card>
    );
  }

  if (step.format === 'timeline' && exercise.type === 'timeline_order') {
    const remaining = step.options.filter((o) => !order.includes(o));
    return (
      <Card>
        {header}
        <Body muted>Tap the events from earliest to latest.</Body>
        {order.map((label, i) => (
          <Body key={label}>
            {i + 1}. {label}
          </Body>
        ))}
        {remaining.map((label) => (
          <Button
            key={label}
            label={label}
            tone="secondary"
            disabled={locked}
            onPress={() => setOrder([...order, label])}
          />
        ))}
        {order.length > 0 && !locked && (
          <Button label="Start over" tone="secondary" onPress={() => setOrder([])} />
        )}
        <Button
          label="Check"
          disabled={locked || remaining.length > 0}
          onPress={() => onAnswer(exercise, step, checkTimeline(exercise, order))}
        />
      </Card>
    );
  }

  if (step.format === 'match' && exercise.type === 'match') {
    const usedRights = new Set(matches.values());
    return (
      <Card>
        {header}
        <Body muted>Pick an item on the left, then its match.</Body>
        {exercise.pairs.map(({ left }) => (
          <Button
            key={left}
            label={matches.has(left) ? `${left} → ${matches.get(left)}` : left}
            tone="secondary"
            selected={activeLeft === left}
            disabled={locked}
            onPress={() => {
              const next = new Map(matches);
              next.delete(left);
              setMatches(next);
              setActiveLeft(left);
            }}
          />
        ))}
        <Row>
          {step.options.map((right) => (
            <View key={right} style={{ flex: 1 }}>
              <Button
                label={right}
                tone="secondary"
                disabled={locked || activeLeft === null || usedRights.has(right)}
                onPress={() => {
                  if (activeLeft === null) return;
                  setMatches(new Map(matches).set(activeLeft, right));
                  setActiveLeft(null);
                }}
              />
            </View>
          ))}
        </Row>
        <Button
          label="Check"
          disabled={locked || matches.size < exercise.pairs.length}
          onPress={() => onAnswer(exercise, step, checkMatch(exercise, matches))}
        />
      </Card>
    );
  }

  return <Banner>This question type isn't supported yet.</Banner>;
}

function SaveTipButton({
  tipId,
  saved,
  onToggle,
}: {
  tipId: string;
  saved: readonly string[];
  onToggle: (tipId: string) => Promise<void>;
}) {
  const isSaved = saved.includes(tipId);
  return (
    <Button
      label={isSaved ? 'Saved to My tips' : 'Save to My tips'}
      tone="secondary"
      selected={isSaved}
      onPress={() => void onToggle(tipId)}
    />
  );
}

export function SessionComplete({
  title,
  summary,
  children,
}: {
  title: string;
  summary: SessionSummary;
  children?: ReactNode;
}) {
  return (
    <Card>
      <Title>{title}</Title>
      <Body>
        {summary.correct} of {summary.answered} right · +{summary.xp} XP
      </Body>
      {children}
    </Card>
  );
}
