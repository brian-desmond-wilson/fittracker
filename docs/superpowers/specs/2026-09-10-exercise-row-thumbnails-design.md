# Exercise row thumbnails and auto-generated pictures

Date: 2026-09-10. Scope: Training › fire button › Exercises tab.

## Problem

Every row in the captured Exercises tab showed the thumbnail of the post the
exercise was captured from. Ten exercises from one video all wore the same
frame, and the picture said nothing about the movement. The exercise already
owns a generated picture (the hero on its detail page); the row ignored it.

## Decisions

1. **The row shows the exercise's own picture.** The catalog query reads the
   exercise's `image_url` alongside its taxonomy, and the row card draws that
   and only that. The source post's thumbnail is not a fallback; it belongs
   to the Workouts tab, which is unchanged.
2. **No picture means an empty muted square**, the same 72×72 slot filled
   with the darker surface colour, so every row's text column lines up
   whether or not the picture exists.
3. **A new exercise gets its picture generated in the background.** Capture
   never mints exercise rows itself; the catalog wizard is the one front
   door (both the match-review "create new" path and the tab's plus button).
   After the wizard's create succeeds it fires the existing
   `generate-exercise-image` function for the new row and returns at once.
   Failure is logged, never surfaced: the save already stood. A row created
   with a pasted image URL is left alone. The list picks the URL up on its
   next load (focus or pull-to-refresh), so a freshly created exercise may
   show the empty square for a few seconds.

## Out of scope

- A bulk "generate missing images" action for the existing catalog.
- Generating pictures for library exercises a capture merely linked.
- Live-refreshing the row when the background job finishes.

## Testing

Unit test on the "does this row want a picture" decision. Typecheck and the
full jest suite pass. On-device check still to do.
