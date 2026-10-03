import type { Grade } from '@ball-knowledge/core';
import { DEFAULT_RETENTION_CONFIG, type RetentionConfig } from './config';

/**
 * How the question was asked: recognition (pick from options) or production
 * (type it, place it). Structured exercises like matching count as recognition.
 */
export type AnswerMode = 'recognition' | 'production';

export interface Answer {
  readonly correct: boolean;
  readonly mode: AnswerMode;
  readonly usedHint?: boolean;
  readonly responseMs?: number;
}

/**
 * Maps an answer to an FSRS grade:
 * - wrong → again
 * - right with a hint, or slow → hard
 * - right → good
 * - fast typed recall → easy (never for recognition, where a guess can be right)
 */
export function gradeAnswer(
  answer: Answer,
  config: RetentionConfig = DEFAULT_RETENTION_CONFIG,
): Grade {
  if (!answer.correct) return 'again';
  const { slowResponseMs, fastResponseMs } = config.grading;
  if (answer.usedHint) return 'hard';
  if (answer.responseMs !== undefined && answer.responseMs > slowResponseMs) return 'hard';
  if (
    answer.mode === 'production' &&
    answer.responseMs !== undefined &&
    answer.responseMs <= fastResponseMs
  ) {
    return 'easy';
  }
  return 'good';
}
