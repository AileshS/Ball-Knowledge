# 0005. Clips, player photos, and team logos

- **Status:** Deferred: **text-first until licensed.** Revisit before any media ships (roadmap Phases 10–11).
- **Date:** 2026-10-02
- **Deciders:** Owner (pending)

## Context

The PRD calls for several kinds of media:

- highlight clips for iconic moments (§7.2, §10)
- "identify the player" exercises using photos, jerseys, or silhouettes (§7.4)
- varied cues, including a player's face (§8)

Media is the main licensing risk:

- **Clips:** game footage is owned by the league and its broadcast partners.
- **Player photos:** photographs are copyrighted, and using many players' likenesses commercially typically needs a players-association group license.
- **Logos:** NFL and team logos and marks are trademarks.

This record is a product guardrail, not legal advice. Get a proper legal review before launch.

## Interim decision

- **Text-first:** every exercise must work without media. The schema requires a **`textFallback`** for any `photo` or `clip` cue (Phase 2).
- **Clips:**
  - Only embeds from official or otherwise licensed sources, where the uploader permits embedding.
  - Never re-hosted.
  - Always with a text description of the moment as a fallback.
- **Player photos:** none until licensed. "Identify the player" uses these cues instead:
  - name
  - jersey number
  - team
  - signature stat
  - signature moment
  - generic silhouettes, which aren't traced from copyrighted photos
- **Logos:** none until licensed. Teams are referred to by name in text, and the UI uses a neutral design language.

## Consequences

- The varied-cue system (PRD §8) works from day one on text, number, stat, and timeline cues. Photo and clip cues plug in later without schema changes.
- Content authors must write a text fallback for every media-based exercise, and the content validator enforces it (Phase 4).
