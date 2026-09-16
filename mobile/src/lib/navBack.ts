// mobile/src/lib/navBack.ts
// Back to wherever we came from — or, when there's nothing to pop, somewhere
// sensible instead of nowhere.
//
// A raw router.back() assumes the stack has a screen beneath. It often doesn't:
// a dev hot reload, a deep link, or a state restore can land on a detail page
// as the stack's only screen, and then back() dispatches an unhandled GO_BACK —
// the button does nothing and logs a warning. Every Training detail screen's
// back goes through here so they all fail the same, sane way.
import type { Router } from "expo-router";

type BackRouter = Pick<Router, "canGoBack" | "back" | "replace">;

export function goBackOr(router: BackRouter, fallback: string): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as never);
}
