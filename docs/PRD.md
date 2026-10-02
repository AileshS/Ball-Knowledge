# Ball Knowledge — Product Requirements (v1)

## 1. Summary

Ball Knowledge is a Duolingo-style learning app for sports. It walks users through structured lessons on a sport, from its rules to its eras, legends, and current players, and uses memory science (spaced repetition, active recall, callbacks to earlier lessons) so that what they learn sticks. The goal is real, lasting sports knowledge that users can bring to arguments with friends and to watching games, not time spent in the app.

## 2. Problem

- Casual and growing fans get sports knowledge piecemeal from highlights, social media, and broadcasts. They see a name once and forget it.
- Most fans know QBs and stars but can't judge a trade for a linebacker or an offensive lineman.
- Nothing teaches a sport's history and its current landscape as one structured path that is built for retention.

## 3. Target users

- **New and casual fans** who want to follow a sport properly (a new partner's team, a new city, a friend group that watches every Sunday).
- **Engaged fans** who know the headlines but want depth: position groups, contracts, history, and the context behind a debate.
- **Debaters** who want facts and stats ready when the GOAT argument starts.

## 4. Goals and non-goals

**Goals**
1. Users retain what they learn. This is the north star (see §9).
2. Cover a sport's history (eras and legends) and its present (current players, teams, and coaches at every position, not just the stars).
3. Make learning feel like a game, with the game mechanics rewarding *retention and mastery* rather than raw time in the app.

**Non-goals (v1)**
- More than one sport. v1 ships one sport done well; the content model must support adding more later.
- Live scores, fantasy tools, betting, or news-feed features.
- Social and multiplayer features (beyond possibly sharing a stat card).
- Engagement tricks that don't serve learning: streak-loss guilt, loot boxes, endless feeds.

## 5. Sport for v1

**Recommendation: NFL.** It has the deepest "present" use case the app is built around (positions most fans ignore, contracts, trades), a long history with clear eras, and huge US interest. NBA is the strong alternative (fewer players to learn, very highlight-friendly). **Open decision — confirm before content production starts.**

## 6. Core user flow

1. **Login / sign-up** (email + Apple/Google sign-in).
2. **Choose a sport** (only one is live in v1; others show as "coming soon").
3. **Short onboarding quiz** to place the user (are the rules already known? the major eras?) so experienced fans can skip the basics.
4. **Choose a track:** **Past** or **Present** (switch at any time; both share a single review queue).
5. **Learning path** → lessons → daily review.

## 7. Content structure

### 7.1 Foundations (required starting unit, skippable via placement)
- Rules of the game, positions and what each one does, how a season and the playoffs work, basic stats and what they mean.

### 7.2 Past track
Organized as a path that goes **broad → deep**:
1. **Eras overview:** one unit per era (what defined it, rule changes, dominant teams, style of play).
2. **Era deep dives** (unlocked once the overview is done): the superstars, coaches, and dynasties of that era, with key stats and *why they matter*.
3. **Iconic moments:** famous plays and games with highlight clips where licensing allows (e.g., Kawhi Leonard's 2019 Game 7 buzzer-beater for the NBA). Each one is tied to the players and era it belongs to.
4. **Debate cards:** context and stats for classic arguments (GOAT debates, best dynasty, and so on).

### 7.3 Present track
Goes deeper than headlines, organized by **position group and team**:
- Every position group, deliberately including the ones fans overlook (for the NFL: O-line, D-line, linebackers, secondary, kickers and punters), not just QBs, RBs, and WRs.
- For each group: the top performers, the highest paid, the breakout players, and the overrated or underrated ones, plus what the stats actually mean for that position.
- Teams and coaches: head coaches and coordinators, schemes, and the core of each roster.
- **"Is this trade worth it?" lessons:** how to judge a player's value from contract, age, production, and role, so a user can assess their own team's moves.
- Content is refreshed during the season and offseason (see §10).

### 7.4 Lesson anatomy
- 3–5 minutes, 8–15 interactions.
- Mix of exercise types: multiple choice, identify the player (photo, jersey, or silhouette), match player → team/era/stat, order events on a timeline, higher-or-lower stat comparisons, "who said / who did it," fill-in-the-blank, watch the clip and answer.
- Every lesson **opens with callbacks** to earlier material and **closes with a recall check** on its own content.

## 8. Retention system (the core differentiator)

Built on evidence-based memory techniques. *Assumption: "memory OS" in the brief refers to these spaced-repetition and active-recall principles; confirm if a specific system was meant.*

- **Spaced repetition:** every fact the app teaches (a player, stat, era, moment, or rule) is a **knowledge item** with its own memory state, scheduled with an FSRS-style algorithm. A daily **Review** session surfaces whatever is due.
- **Active recall over recognition:** the app prefers making users *produce* answers (type a name, place someone on a timeline) over picking from options as an item matures.
- **Callbacks / interleaving:** new lessons pull in previously learned items in new contexts. For example, a 2020s O-line lesson brings back a Hall of Fame lineman from an earlier era as the comparison point. A name the user has learned should keep showing up.
- **Varied cues:** the same player is tested through their face, jersey number, team, signature stat, and signature moment, so recall doesn't depend on a single prompt.
- **Elaboration hooks:** each item carries a memorable "why it matters" line or story. Facts stick better when attached to a narrative.
- **Mastery levels per item** (e.g., New → Learning → Familiar → Mastered), visible to the user.
- **Decay is visible:** items the user is starting to forget are flagged and fed back into review. Units can "fade" and need a refresh.

## 9. Gamification, with incentives aimed at retention

| Mechanic | Rewards | Avoid |
|---|---|---|
| XP | Correct *recall*, with more for harder and older items | XP for simply opening lessons |
| Streaks | Completing the due review (a "Review streak") | Guilt notifications; a lost streak wipes nothing |
| Mastery map | Visual coverage of the sport (eras, teams, positions) filling in as items reach Mastered | — |
| Knowledge ranks | Rookie → Starter → Pro Bowl → All-Pro → Hall of Fame, gated on *mastered* items, not time spent | Ranks you can grind without learning |
| Debate Mode | Quick challenge rounds on a debate topic using mastered facts; unlocks shareable stat cards | — |
| Daily goal | A small, finishable target (e.g., today's due reviews plus 1 new lesson) | Infinite sessions |

**Principle:** once the day's goal is met, the app should say "you're done for today." It does not try to keep users scrolling.

## 10. Content and data

- **Curated, fact-checked content** is the source of truth. AI can help draft lessons and generate exercise variants, but every fact must trace back to a cited source and pass review before it ships.
- **Stats and contracts** for the Present track come from a licensed sports-data provider (TBD) and are refreshed on a schedule. Lessons reference data by ID so numbers update without rewriting lessons.
- **Highlight clips:** licensing is the main risk. In v1, use embeds or links from official league or YouTube sources where permitted; fall back to text and image descriptions of the moment.
- Each knowledge item records its sport, track, era/season, the entities it's about (player, team, coach), and when it was last verified, so stale Present content can be found and fixed.

## 11. v1 scope (MVP)

**In:** auth; one sport; placement quiz; Foundations; Past track (all eras overview + deep dives for 2–3 eras); Present track (all position groups + "is this trade worth it" unit); spaced-repetition review queue; core exercise types; XP, review streak, mastery map, ranks; iOS + Android (or a mobile-first web app if faster to validate).

**Later:** additional sports; Debate Mode with friends; clip library at scale; live-season "this week" micro-lessons; leaderboards built on mastery rather than XP.

## 12. Success metrics

- **North star:** the number of knowledge items the average user has *retained*, measured as recall accuracy on items reviewed 30 or more days after first learning them.
- Day-30 recall accuracy ≥ 80% on mastered items.
- Review completion rate (the share of due reviews completed).
- D7 / D30 retention (users), tracked but secondary to knowledge retention.
- Qualitative: "I used something I learned in a real conversation" (in-app prompt).

## 13. Risks and open questions

1. **Which sport ships first?** Recommendation: NFL (§5).
2. **Clip rights:** can highlights be embedded legally at launch?
3. **Data provider and cost** for current stats and contracts.
4. **Keeping content fresh:** who updates Present content when trades and contracts happen, and how quickly?
5. **Factual accuracy:** errors kill credibility with sports fans, so a review step is mandatory.
6. **Platform:** native mobile vs. cross-platform vs. web-first for the MVP.
