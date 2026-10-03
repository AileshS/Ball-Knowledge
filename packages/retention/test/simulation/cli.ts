/**
 * Prints a year of simulated use so the owner can see how the scheduler behaves.
 * Run with: npm run sim -w @ball-knowledge/retention
 */
import { FORGETFUL_LEARNER, TYPICAL_LEARNER } from './learner';
import { meanDailyReviews, simulate, type SimulationResult } from './run';

const DAYS = 365;
const ITEMS_PER_LESSON = 4;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function report(result: SimulationResult): void {
  console.log(
    `\n=== Learner: ${result.profile} (${DAYS} days, ${ITEMS_PER_LESSON} new items/lesson) ===`,
  );
  console.log('Weeks    | reviews/day (avg, max) | lessons | days done');
  for (let start = 0; start < DAYS; start += 28) {
    const slice = result.days.slice(start, start + 28);
    const avg = slice.reduce((s, d) => s + d.reviewAnswers, 0) / slice.length;
    const max = Math.max(...slice.map((d) => d.reviewAnswers));
    const lessons = slice.reduce((s, d) => s + d.lessons, 0);
    const done = slice.filter((d) => d.done).length;
    const label = `${String(start / 7 + 1).padStart(2)}-${String(Math.ceil(Math.min(start + 28, DAYS) / 7)).padStart(2)}`;
    console.log(
      `${label.padEnd(8)} | ${avg.toFixed(1).padStart(6)}, ${String(max).padStart(4)}          | ${String(lessons).padStart(7)} | ${done}/${slice.length}`,
    );
  }
  const m = result.masteryCounts;
  console.log(`Items learned: ${result.itemsLearned}`);
  console.log(
    `Mastery now: new ${m.new}, learning ${m.learning}, familiar ${m.familiar}, mastered ${m.mastered}`,
  );
  console.log(`Review accuracy (all reviews): ${pct(result.reviewAccuracy)}`);
  console.log(
    `North star (Mastered items, 30+ days after learning): ${pct(result.northStar.accuracy)} over ${result.northStar.reviews} reviews`,
  );
  console.log(
    `True recall 30 days after reaching Mastered: ${pct(result.masteredRecallAt30Days.mean)} (${result.masteredRecallAt30Days.items} items)`,
  );
  console.log(
    `Mean reviews/day, last 8 weeks: ${meanDailyReviews(result, DAYS - 56, DAYS).toFixed(1)}`,
  );
  console.log(`Longest wait past due: ${result.maxOverdueDays.toFixed(2)} days`);
}

for (const profile of [TYPICAL_LEARNER, FORGETFUL_LEARNER]) {
  report(simulate({ profile, seed: 7, days: DAYS, itemsPerLesson: ITEMS_PER_LESSON }));
}
