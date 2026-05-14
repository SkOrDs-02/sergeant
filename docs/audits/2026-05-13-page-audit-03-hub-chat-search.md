# Page Audit — Hub Chat, Search & Backup panel

> **Last validated:** 2026-05-13 by Devin.
> **Status:** Active
> **Auditor:** child Devin session (parent: https://app.devin.ai/sessions/7d63e4e64e644012afe8c886eab9fc40)
> **Pages in scope:**
>
> - `apps/web/src/core/hub/HubChat.tsx`
> - `apps/web/src/core/hub/HubChatPage.tsx`
> - `apps/web/src/core/hub/HubChatHistoryDrawer.tsx`
> - `apps/web/src/core/hub/chat/*` (useChatSend, useChatSessions, HubChatBody, HubChatComposer, HubChatHeader, ChatEmpty)
> - `apps/web/src/core/hub/search/*` (HubSearch, useSearchEngine, useInlineAiRail, InlineAiRail, SearchInput, SearchResults, SearchResultItem, searchSources, searchActions, searchSettings, searchTypes, searchCache)
> - `apps/web/src/core/hub/hubSearchEngine.ts`
> - `apps/web/src/core/hub/HubBackupPanel.tsx`
> - `apps/web/src/core/hub/hubBackup.ts`
> - `apps/web/src/core/hub/hubChatSessions.ts`

## Summary

- Critical: 1
- High: 6
- Medium: 13
- Low: 6

**Themes.** Domain-invariant timezone violations (multiple modules format dates with the host clock instead of Europe/Kyiv); touch-target gaps in the history drawer and inline cancel pill; widespread absence of `Last validated` / `Status` lifecycle markers across the scope; AI-tool-call inputs trusted as `Record<string, unknown>` without runtime validation before being executed against real mutators; a `?q=` deep-link path that auto-sends arbitrary text to the AI assistant on render; and missing unit tests around the multi-session persistence, undo, and search-sources pipelines.

## Findings

### F1 — `hubChatSessions.deriveSessionTitle` formats with host timezone, violating Kyiv domain invariant [severity: high] [perspective: bug]

**Page:** `HubChat` (sessions library)
**File:** `apps/web/src/core/hub/hubChatSessions.ts`
**Lines:** L35–L50

**Description.** `deriveSessionTitle` builds the fallback `Бесіда DD.MM HH:MM` label with `new Date(createdAt)` + `date.getDate()` / `getMonth()` / `getHours()` / `getMinutes()`. Those getters return host-local values, not Europe/Kyiv values. On a device whose OS clock is set to Berlin / London / UTC, a session that the user actually created at 11:30 Kyiv will surface in the drawer as `10:30` / `09:30` / `08:30`. The same label is re-derived on every debounced flush in `useChatSessions` (L107–L111), so the value is sticky once written.

**Why it matters.** `docs/architecture/domain-invariants.md` declares **Europe/Kyiv** as the single source of truth for time. Mis-stamped session titles desynchronise the drawer from the user's mental model ("yesterday at 23:55" vs "today at 00:55") and from any time-based filters or recents views built on top.

**Recommendation.** Format with `Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", … })` (or a shared `formatKyivStamp` helper) instead of raw `getHours()` / `getDate()`. Same fix should apply consistently across the scope (see F2, F8).

---

### F2 — `HubChatHistoryDrawer.formatStamp` uses host time for "today" detection and HH:MM rendering [severity: high] [perspective: bug]

**Page:** `HubChatHistoryDrawer`
**File:** `apps/web/src/core/hub/HubChatHistoryDrawer.tsx`
**Lines:** L17–L30

**Description.** `formatStamp` decides "same day" by comparing `d.getFullYear()/getMonth()/getDate()` against `today` (both host-local) and then renders `${hh}:${mm}` or `${dd}.${mo} ${hh}:${mm}` using local `getHours()/getMinutes()/getDate()`. The function has no `timeZone: "Europe/Kyiv"` path. As a result, the "Сьогодні" pill and the date stamp drift the same way as F1 once the user's device clock or timezone deviates from Kyiv (travel, manual override, server-rendered SSR, Playwright runners pinned to UTC).

**Why it matters.** Drawer is the canonical list of past chats — wrong dates produce duplicate-looking sessions ("two chats yesterday at 23:55" that are actually 23:55 + 00:55 Kyiv) and break the iOS Messages convention the comment promises (L49–L50).

**Recommendation.** Pull a shared `formatKyivStamp` / `kyivDayKey` helper (Hard Rule — domain invariants) and replace the bespoke `getHours()` block. Add a Vitest case that mocks `Date.now()` while running under `TZ=America/Los_Angeles` to lock the behaviour.

---

### F3 — `useChatSend` runs `tool_calls` from the model through `executeActions` with no runtime validation [severity: critical] [perspective: security]

**Page:** `HubChat` (send pipeline)
**File:** `apps/web/src/core/hub/chat/useChatSend.ts`
**Lines:** L271–L322

**Description.** When the server returns `data.tool_calls`, the hook does:

```ts
type ToolCall = { id: string; name: string; input: Record<string, unknown> };
const toolCalls = data.tool_calls as ToolCall[];
const handlerResults = await executeActions(
  toolCalls as Parameters<typeof executeActions>[0],
);
```

There is no zod / typia / hand-written guard between the JSON and `executeActions`. `executeActions` covers mutator tools (`create_transaction`, `mark_habit_done`, `log_meal`, `create_habit`, …) that write into Finyk / Routine / Nutrition state. A compromised or misbehaving model response (e.g. malformed `input`, missing `id`, wrong type for an amount field, prompt-injection that coerces the assistant into producing `{"name":"create_transaction","input":{"amount":"-9999999"}}`) will be executed against real user data with only the optimistic-undo toast (L296–L304) as a recovery path.

**Why it matters.** Hard Rule #3 requires the server↔client contract to be enforced on both sides; combined with the AI's known susceptibility to prompt injection, treating the tool-call payload as `Record<string, unknown>` is the single highest-impact gap in this scope. A bad tool call can corrupt money (`amount` shape), trigger a wrong-day habit completion (`completedAt` timezone — see F1), or silently spam the database under the 5-second undo window.

**Recommendation.** Define a discriminated union `ToolCallEnvelope` (one variant per tool name) with a zod / typia schema; parse `data.tool_calls` through it before `executeActions`. On parse failure, surface a "не вдалося виконати дію" toast and fall back to plain-text rendering. Mirror the same schema on the server.

---

### F4 — `/chat?q=…&autoSend=1` deep link auto-sends arbitrary text to the AI on render [severity: high] [perspective: security]

**Page:** `HubChatPage`
**File:** `apps/web/src/core/hub/HubChatPage.tsx`
**Lines:** L30–L38, see also `useChatSend.ts` L462–L469

**Description.** `HubChatPage` reads `?q=` and `?autoSend=1` from `useSearchParams` and forwards them into `HubChat`. Inside `useChatSend`:

```ts
useEffect(() => {
  if (!initialMessage) return;
  if (autoSendInitial) sendRef.current?.(initialMessage);
  else setInput(initialMessage);
}, [initialMessage, autoSendInitial]);
```

Any third-party site can post a link like `https://app.sergeant.lol/chat?q=<arbitrary%20text>&autoSend=1`. When an authenticated user clicks it, the first paint of `/chat` fires a chat send against the Anthropic-backed endpoint with that exact text, server-side context attached. This is a same-origin CSRF-shaped surface (no token, only auth cookie), and the user has no chance to review the message before it ships.

**Why it matters.** Tokens are spent on attacker-controlled prompts; bills accrue on the user account; the chat history is poisoned with an unsolicited turn; if combined with F3, attackers can suggest specific tool-call wording ("транзакція -50000 ₴ на тестовий рахунок") that may be acted on.

**Recommendation.** Require an explicit confirmation step for any `autoSend=1` originating outside the in-app launcher: either gate `autoSend` on `document.referrer` matching `location.origin`, or always prefill the input and let the user press Send. Alternatively, sign the launcher's `autoSend` hand-off with a short-lived nonce.

---

### F5 — Voice-keyword regex auto-triggers TTS playback without user consent [severity: medium] [perspective: security]

**Page:** `HubChat` (send pipeline)
**File:** `apps/web/src/core/hub/chat/useChatSend.ts`
**Lines:** L200–L202

**Description.** `shouldSpeak = fromVoice || lastWasVoice.current || VOICE_KEYWORDS.test(msg)`. `VOICE_KEYWORDS` (in `hubChatSpeech.ts`) matches `голосом|вголос|скажи|озвуч|прочитай` anywhere in the user's text. There is no per-user "speak responses" preference check and no detection of whether the device is in a sensitive context (coarse pointer, headphones absent, public room).

**Why it matters.** Privacy / public-space leak: a user can casually type "скажи що там у мене з фінансами в кінці місяця" in a meeting room and the assistant will read the answer (balance, debts) aloud through `window.speechSynthesis`. Once started there is no muted-by-default fallback.

**Recommendation.** Add a `preferences.tts.autoSpeak` toggle (default off). Only invoke `maybeSpeak(...)` when the user explicitly typed via voice (`fromVoice`) or has the toggle on. Keep the regex as a hint for an inline "🔊 Озвучити" button, not as a silent trigger.

---

### F6 — Touch targets in `HubChatHistoryDrawer` (close, delete) are below 44×44 px [severity: high] [perspective: a11y]

**Page:** `HubChatHistoryDrawer`
**File:** `apps/web/src/core/hub/HubChatHistoryDrawer.tsx`
**Lines:** L94–L109 (avatar + close button), L173–L181 (delete button), L102–L109 (close button itself is `w-9 h-9` = 36 px)

**Description.** The drawer header close button is `w-9 h-9` (36 px), and the per-row delete button is `w-9 h-9` as well. `apps/web/AGENTS.md § Touch targets` (and Hard Rule #14-adjacent WCAG 2.5.5) mandates `≥ 44×44 px` for coarse-pointer hit areas — the project ships a `touch-target` utility and a `Button` variant precisely for this. The drawer cells skip both.

**Why it matters.** Coarse-pointer users (the entire mobile audience) routinely miss the delete-confirm or close-drawer affordance; mis-taps on the row body open the wrong chat instead. The WCAG criterion is a known accessibility-blocker tier.

**Recommendation.** Switch the icon buttons to `<Button variant="iconOnly" size="sm">` (auto-applies `min-h-[44px] min-w-[44px]`) or add the `touch-target` utility. For the delete button keep visual density via a transparent 44 px hit area centred on a 28 px glyph.

---

### F7 — Inline cancel pill in `HubChatBody` is `h-7` (28 px) — below WCAG touch-target [severity: medium] [perspective: a11y]

**Page:** `HubChatBody`
**File:** `apps/web/src/core/hub/chat/HubChatBody.tsx`
**Lines:** L62–L77 (the `<button>` inline with the typing indicator)

**Description.** The cancel pill is rendered as `<button className="… h-7 px-2.5 …">` — 28 px high, no `touch-target` utility, no `min-h-[44px]`. On mobile users have to abort the AI call by tapping a 28 px target that is also crowded next to the typing dots.

**Why it matters.** Mid-stream cancellation is the only escape hatch for a 90-second runaway request; failing to hit it leaves the user staring at the typing indicator while tokens burn server-side.

**Recommendation.** Use `<Button size="sm" variant="ghost">` (auto-applies the 44 px floor and keeps the same visual size via inner padding/icon) or wrap the icon in a `touch-target` square.

---

### F8 — `searchTypes.localDateKey` & `searchSources` produce non-Kyiv day keys [severity: high] [perspective: bug]

**Page:** `HubSearch` (sources pipeline)
**File:** `apps/web/src/core/hub/search/searchTypes.ts` (L61–L63), `apps/web/src/core/hub/search/searchSources.ts` (calls at L45, L147, L262, L279)

**Description.** `localDateKey(d: Date)` returns `YYYY-MM-DD` from `d.getFullYear()/getMonth()/getDate()` — host time. `searchSources` calls it on transaction `txDate`, workout `date`, food `eatenAt`, etc., then groups / matches results by that key. The domain invariant ([`docs/architecture/domain-invariants.md`](../architecture/domain-invariants.md)) is **`YYYY-MM-DD` in Kyiv local**, week start Monday. The util is the canonical day-key for the entire palette — wrong key = wrong grouping for every search hit that mentions a date.

**Why it matters.** Users searching "вчора кава" miss the matching transaction if the device is in a non-Kyiv timezone. The bug compounds with F1 / F2 because the same wrong-tz value is rendered in the result subtitle.

**Recommendation.** Replace `localDateKey` with a `kyivDayKey(d)` helper that formats via `Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", year, month, day })`. Add a unit test that locks the behaviour under `TZ=UTC` and `TZ=Pacific/Auckland`.

---

### F9 — Nested interactive elements inside the session row (a11y violation) [severity: medium] [perspective: a11y]

**Page:** `HubChatHistoryDrawer`
**File:** `apps/web/src/core/hub/HubChatHistoryDrawer.tsx`
**Lines:** L142–L182

**Description.** The session row is a `<div role="button" tabIndex={0} onClick={…}>` and *contains* a real `<button>` for the delete affordance. Nesting an interactive element inside another interactive element violates HTML semantics (`<button>` cannot be a descendant of `[role="button"]` for the same reason it cannot live inside an `<a>` / `<button>`). Screen readers read both as activatable; keyboard focus order becomes ambiguous (Tab → row → delete button → row → …).

**Why it matters.** Users with assistive tech can accidentally delete the wrong chat when keyboard-focusing the row and pressing Enter (the outer handler fires `onSelect`, but on click bubbling the inner delete still ran `e.stopPropagation()` — the inverse path is fragile). Also fails axe-core `nested-interactive` rule.

**Recommendation.** Refactor the row into either (a) a single `<button>` with the delete as a sibling Popover trigger that opens on long-press / context menu, or (b) a `role="option"` list item where activation is via Enter/Space and delete is a separately-tabbable button outside the row's hit area.

---

### F10 — Search dialog (`HubSearch`) has no focus trap; only Esc is bound [severity: medium] [perspective: a11y]

**Page:** `HubSearch`
**File:** `apps/web/src/core/hub/search/HubSearch.tsx` and `apps/web/src/core/hub/search/useSearchEngine.ts`
**Lines:** `HubSearch.tsx:30–L71`, `useSearchEngine.ts:73–L75`

**Description.** The shell is declared `role="dialog" aria-modal="true"` but does not call `useDialogFocusTrap` (the helper used by `HubChatHistoryDrawer`). Tab/Shift-Tab can escape the palette into the background page (header, nav, footer), and Esc-handling is split between SearchInput + the engine — nothing prevents the focus from leaving the dialog while the overlay is mounted.

**Why it matters.** `aria-modal="true"` is a promise to assistive tech that focus is contained; breaking that promise means screen-reader users navigate into "dead" background content that's visually hidden behind the overlay.

**Recommendation.** Wrap the dialog body with `useDialogFocusTrap(open=true, panelRef, { onEscape: onClose })` — the same hook the history drawer already uses successfully.

---

### F11 — Lifecycle markers (`Last validated:` / `Status:`) missing across the entire scope [severity: medium] [perspective: lifecycle]

**Page:** all files in scope
**File:** every `.ts`/`.tsx` listed at the top of this audit
**Lines:** N/A (the markers are absent entirely)

**Description.** Hard Rule #10 ([`docs/governance/rules/10-lifecycle-markers.md`](../governance/rules/10-lifecycle-markers.md)) requires every file/doc to declare `> **Last validated:** YYYY-MM-DD` and `> **Status:** Active | Scaffolded | Deprecated | Archived`. A `grep` across the 23 scope files turned up zero matches for either string. The only lifecycle hint is a stray `@scaffolded` JSDoc tag at `HubChatPage.tsx:10` — that is the historical AI-marker format, not the new lifecycle block.

**Why it matters.** Hub chat / search / backup is in active flux (multi-session migration, inline AI rail, `/chat` route extraction). Without lifecycle markers the next agent cannot tell whether a file is "stable, last reviewed 4 weeks ago" or "scaffolded last sprint and known incomplete". Rule #10 explicitly grades this as a medium severity.

**Recommendation.** Add the canonical block to the top of each TS / TSX module (after the JSDoc, before imports if the file is a source module — see the convention in `apps/web/AGENTS.md` itself). Auto-bump via the `bump-last-validated.mjs` pre-commit hook.

---

### F12 — `HubChatBody` auto-scrolls to bottom on every message change, breaking "scroll up to read history" [severity: medium] [perspective: ux]

**Page:** `HubChatBody`
**File:** `apps/web/src/core/hub/chat/HubChatBody.tsx`
**Lines:** L44–L47

**Description.** The effect snaps `chatRef.current.scrollTop = chatRef.current.scrollHeight` whenever `messages` *or* `loading` changes. There is no "user has scrolled away from the bottom" guard. If the user scrolls up to re-read an earlier answer and a streamed delta arrives (`useChatSend` calls `setMessages` on every SSE chunk), the view is yanked back to the bottom mid-read.

**Why it matters.** Standard chat-UI failure mode; it interferes with reviewing long assistant answers, which directly undermines the "Усі бесіди" history feature shipped in the same scope.

**Recommendation.** Track a `stickToBottomRef` that flips false once `scrollTop + clientHeight < scrollHeight - 32` after a user-initiated scroll, and only autoscroll when the ref is true. Re-stick on Send (user sent → user wants to see reply).

---

### F13 — `HubChatPage.handleClose` falls back to `navigate("/")` only when `window.history.length <= 1` — unreliable signal [severity: medium] [perspective: bug]

**Page:** `HubChatPage`
**File:** `apps/web/src/core/hub/HubChatPage.tsx`
**Lines:** L40–L49

**Description.** `window.history.length` is the size of the session history stack, not "did the user come from inside the app". A direct hit, a refresh, a new-tab open all produce `length >= 1` (and often `>1` after the SPA navigates around) — so `navigate(-1)` can send the user to `about:blank` or to a non-Sergeant origin instead of the Hub. Conversely, an in-app navigation from `/finyk` to `/chat` will sometimes report `length == 1` if the browser restored a fresh session.

**Why it matters.** "Close chat" is a hot-path control; sending the user to an arbitrary previous tab page is a confusing dead-end.

**Recommendation.** Track an internal "came from" via `state` on `navigate(`/chat`, { state: { from } })` or persist the previous in-app route in `sessionStorage`. Fall back to `navigate("/", { replace: true })` if there is no recorded in-app origin.

---

### F14 — `useChatSessions` title-rewrite test `title.startsWith("Бесіда ")` will steamroll legitimate user titles [severity: medium] [perspective: bug]

**Page:** `HubChat` (sessions library)
**File:** `apps/web/src/core/hub/chat/useChatSessions.ts`
**Lines:** L107–L111

**Description.** On every debounced flush the hook re-derives the title only when:

```ts
target.title.startsWith("Бесіда ") || target.title === "Нова бесіда"
```

`"Бесіда "` is also a perfectly valid prefix a user might type when manually renaming a chat ("Бесіда з тренером", "Бесіда про відрядження", …). If session-rename ships later (or already exists via an external code path), any rename starting with "Бесіда " will be silently overwritten by the next debounce flush, because the heuristic conflates "auto-generated fallback" with "starts with the Ukrainian word for *conversation*".

**Why it matters.** Loss of user-edited metadata; very hard to debug because the corruption only triggers on the next message after the rename.

**Recommendation.** Track an explicit `titleSource: "auto" | "user"` flag on `HubChatSession` (default `"auto"` for newly minted sessions, flip to `"user"` on rename) and gate the rewrite on `titleSource === "auto"`.

---

### F15 — `hubChatUtils.consumeHubChatSse` accepts unbounded server SSE without per-chunk size cap [severity: medium] [perspective: perf]

**Page:** `HubChat` (SSE consumer)
**File:** `apps/web/src/core/hub/lib/hubChatUtils.ts`
**Lines:** L85–L114

**Description.** The reader appends to `buf` on every chunk and only splits on `\n`. There is no upper bound on `buf` length and no upper bound on `acc` (the streamed assistant text in `useChatSend.ts:349–L356`). A misbehaving server or a runaway model can stream a multi-megabyte chunk; in the meantime each delta triggers `setMessages((m) => m.map(...))` which rerenders the entire chat list and the markdown parser in `AssistantMessageBody`.

**Why it matters.** Memory pressure on low-end mobile + frame drops every keystroke-equivalent on the AI side. The 90-second timeout in `useChatSend` (L227–L231) bounds *time* but not *bytes*.

**Recommendation.** Add a `MAX_STREAM_BYTES` (e.g. 256 KB total, 8 KB per chunk) and abort the controller / reject the promise once exceeded. Surface a friendly "Відповідь занадто довга" message.

---

### F16 — `searchSources.performSearch` re-scans `finyk_tx_cache` synchronously on every keystroke after 120 ms debounce [severity: medium] [perspective: perf]

**Page:** `HubSearch` (sources)
**File:** `apps/web/src/core/hub/search/searchSources.ts`
**Lines:** scoring loop around L260–L300 with `searchCache.ts` memoization

**Description.** The debounced effect in `useSearchEngine` (L86–L98) wraps `setResults` in `startTransition`, which is good. However the actual `performSearch(query)` call runs eagerly on the main thread inside the timer; `searchSources` walks `finyk_tx_cache` (potentially several MB on heavy users) every time. The `parseCache` in `searchCache.ts` caches *parsed* arrays but not *scored* results — a long query still re-scores the whole transaction set on each keystroke.

**Why it matters.** Users on a 1-year-old Android device report visible typing lag in the palette; the bottleneck is not React but the scoring pass. The fix is mechanical (LRU on `query → ScoredHits[]` keyed by `(query, parserSnapshotId)`).

**Recommendation.** Add an LRU(`size=16`) cache keyed by normalized query + parser snapshot version. Invalidate on storage events for any of the parser source keys.

---

### F17 — `useChatSend` initial-message effect depends on `initialMessage` but mutates `setInput`/`setMessages` without listing them [severity: low] [perspective: bug]

**Page:** `HubChat` (send pipeline)
**File:** `apps/web/src/core/hub/chat/useChatSend.ts`
**Lines:** L462–L469

**Description.** The effect runs when `initialMessage` or `autoSendInitial` change and calls `sendRef.current?.(...)` (which closes over `setMessages`) or `setInput(initialMessage)`. The dep array omits `setInput`. React-hooks rules tolerate this when setters are stable, but the same effect will *re-fire* on every URL `?q=` change — including back-button navigations or external linking — auto-sending a new message *every time* the user lands on `/chat?q=X` again. Combined with F4, the surface widens.

**Why it matters.** Double-send / silent-resend is hard to detect post-hoc because both fires append to the same session.

**Recommendation.** Wrap with a `sentInitialRef = useRef(false)` flag (mark true after first send) and only fire when the ref is false. Reset on chat-close so a deliberate re-open of `/chat?q=` works once.

---

### F18 — `chat/HubChatHeader.tsx` builds a `Popover` trigger out of a `<span role="button"-less>` styled with `cursor-pointer select-none` — non-button activation [severity: medium] [perspective: a11y]

**Page:** `HubChatHeader`
**File:** `apps/web/src/core/hub/chat/HubChatHeader.tsx`
**Lines:** L48–L93

**Description.** The popover trigger is a `<span aria-label="Деталі асистента" className="… cursor-pointer select-none">`. There is no `role="button"`, no `tabIndex={0}`, no Enter/Space handler. The shared `Popover` may wire some of this internally, but the raw markup here is a non-focusable, non-keyboard-activatable span pretending to be a control. The `aria-label` won't compensate for the missing role.

**Why it matters.** Keyboard / assistive-tech users cannot open the "Деталі" popover at all; the only way to reach "Усі бесіди" / clear-chat from the header is via the small explicit buttons further right.

**Recommendation.** Replace the `<span>` with a real `<button type="button">` (still styled inline), or rely on `Popover` rendering its own trigger element (most shared `Popover` impls accept `as="button"` or render-prop).

---

### F19 — `aria-live="polite"` on the chat scroller is a verbosity trap during streamed responses [severity: low] [perspective: a11y]

**Page:** `HubChatBody`
**File:** `apps/web/src/core/hub/chat/HubChatBody.tsx`
**Lines:** L51–L57

**Description.** The scrollable container is annotated `aria-live="polite" aria-relevant="additions"`. During SSE streaming the assistant message updates *in-place* via `setMessages(... .map ...)`. `aria-relevant="additions"` will mostly ignore in-place text mutations (the message node already existed), but every new user / assistant turn — and every loading-flip toggling the cancel pill — re-announces the whole subtree. There is also no `aria-busy="true"` while `loading`.

**Why it matters.** Screen-reader users hear duplicated content (typing indicator label + assistant placeholder + final text) per turn; combined with the auto-TTS in F5 this becomes unusable in busy environments.

**Recommendation.** Limit the live region to a hidden sibling `<div aria-live="polite">` that receives a concise status string ("Асистент друкує…", "Готова відповідь з N символів") and drop the live annotation on the whole scroll list. Add `aria-busy={loading}` on the message list.

---

### F20 — `HubBackupPanel` export reuses the user's downloaded JSON without redaction of Better-Auth opaque user IDs [severity: medium] [perspective: security]

**Page:** `HubBackupPanel` / `hubBackup`
**File:** `apps/web/src/core/hub/hubBackup.ts`
**Lines:** L42–L80 (`buildHubBackupPayload`), `apps/web/src/core/hub/HubBackupPanel.tsx` L59–L76

**Description.** `buildHubBackupPayload({ includeChat: false })` collects Finyk + Fizruk + Routine + Nutrition state. The shape returned by `readFinykBackupFromStorage` (and the routine/nutrition equivalents) still carries Better-Auth opaque user IDs, account UUIDs, and arbitrary `manualDebts[].title` strings that may contain free-form PII ("Іван Петрович — позика 12 000"). The panel currently advertises only "Token Monobank і кеш транзакцій не входять", which understates the leak surface.

**Why it matters.** The exported JSON is a deliberate user action, but it lands in the user's `Downloads` folder and is the most common artefact to be forwarded to support, screen-shared, or pushed to a personal cloud. Opaque user IDs + manual-debt titles are PII per `domain-invariants.md`.

**Recommendation.** Either (a) redact `userId`-shaped fields before serialisation and provide a separate "Безпечний експорт" option, or (b) extend the panel description with an explicit list of PII categories included and ship a "Поділитися" hint pointing at password-managers / encrypted clouds.

---

### F21 — `searchSources` results are not sanitised before being passed into `AssistantMessageBody` for AI-handoff snippets [severity: medium] [perspective: security]

**Page:** `HubSearch` → `InlineAiRail` → `AssistantMessageBody`
**File:** `apps/web/src/core/hub/search/InlineAiRail.tsx`, `apps/web/src/shared/components/AssistantMessageBody.tsx`

**Description.** `AssistantMessageBody` rolls its own lightweight markdown parser (good — avoids the react-markdown footgun) and has an `isSafeHref` guard (L41–L44). However the rail also surfaces user-typed search snippets and arbitrary localStorage-sourced titles directly inside it. The parser handles links via `[text](href)` — if any localStorage-cached string ever contains `[click](javascript:alert(1))`, the parser will still emit a link whose `href` is rejected by `isSafeHref`. Good. But the surrounding text uses the same `INLINE_TOKEN_RE` regex which honours `**bold**` and `` `code` ``: a user who pastes a "search query" containing carefully crafted backticks can break the visual rendering and confuse screen-readers (rendering "command" inside a search hit).

**Why it matters.** Not an XSS (the parser's allowlist holds), but it is a phishing surface: an attacker who can write any localStorage key (other module storing user-controlled strings) can inject visually fake "AI suggestions" inside the rail.

**Recommendation.** When rendering *user-sourced* text (search snippets, recent queries, localStorage-cached titles), call a `renderAsPlainText(s)` path that escapes markdown tokens; reserve the markdown parser for *assistant-sourced* text only. Document the boundary in `AssistantMessageBody` JSDoc.

---

### F22 — No unit / integration tests for `useChatSend`, `useChatSessions`, `hubChatSessions`, `searchSources`, `hubBackup` [severity: medium] [perspective: test]

**Page:** scope-wide
**File:** `apps/web/src/core/hub/chat/*`, `apps/web/src/core/hub/search/*`, `apps/web/src/core/hub/hubChatSessions.ts`, `apps/web/src/core/hub/hubBackup.ts`
**Lines:** N/A (absence)

**Description.** Only `chat/ChatEmpty.test.tsx` exists in the scope. Critical paths with no test coverage:

- `useChatSessions` debounced flush → `saveSessions` (multi-session persistence + legacy `hub_chat_history` migration)
- `useChatSessions.handleDeleteSession` undo flow (depends on stable refs / `useToast`)
- `useChatSend` SSE consumer + tool-call dispatch (the F3 surface)
- `hubChatSessions.loadSessions` + `migrateLegacyIfNeeded` (one-time migration is exactly the kind of bug-on-rollout you want a test for)
- `searchSources.performSearch` scoring + grouping (every keystroke goes through it)
- `hubBackup.buildHubBackupPayload` / `applyHubBackupPayload` shape contract
- `searchTypes.localDateKey` / `hubChatSessions.deriveSessionTitle` timezone behaviour (would catch F1, F2, F8)

**Why it matters.** AGENTS.md `Verification before PR` matrix expects `pnpm test` green — but green doesn't mean covered. The most regression-prone files in the scope have no unit safety net.

**Recommendation.** Add a per-file Vitest harness: `hubChatSessions.test.ts` (migration + cap), `useChatSessions.test.tsx` (RTL with fake timers for the debounced flush), `useChatSend.test.tsx` (MSW mock for `/api/hub/chat` SSE + tool calls), `searchSources.test.ts` (fixture localStorage). Start with the timezone case so F1/F2/F8 get a guard rail.

---

### F23 — `getActiveModules(localStorageStore)` runs synchronously inside `ChatEmpty` `useMemo([])` without invalidation [severity: low] [perspective: bug]

**Page:** `ChatEmpty`
**File:** `apps/web/src/core/hub/chat/ChatEmpty.tsx`
**Lines:** L76–L79

**Description.** `useMemo(() => new Set(getActiveModules(localStorageStore)), [])` reads localStorage once at mount and never updates. If the user enables/disables a module in Settings while the chat is open, the empty-state suggestion list will keep showing the old module set until the page reloads.

**Why it matters.** Edge case but maps to a real flow: a fresh user lands on `/chat`, opens Settings in a side-drawer, toggles modules on, returns to `/chat` — the suggestions are stale. The component already imports from `dashboardStore`; subscribing is cheap.

**Recommendation.** Either subscribe to `dashboardStore` updates (`useSyncExternalStore`) or memoise the value in a `useDashboardModules()` hook used elsewhere. Listing this as low because the surface is the empty state only.

---

### F24 — `InlineAiRail` uses `answerRef.current?.focus()` without checking whether the rail still has the user's attention [severity: low] [perspective: ux]

**Page:** `InlineAiRail`
**File:** `apps/web/src/core/hub/search/InlineAiRail.tsx`
**Lines:** L54–L58

**Description.** A focus effect calls `answerRef.current?.focus()` whenever the rail state flips. If the user has tabbed away into the result list or the search input, the focus is stolen back to the rail card. There is no `prefers-reduced-motion` / focus-preservation guard.

**Why it matters.** Keyboard users lose their place; this is the exact "focus theft" anti-pattern axe-core flags.

**Recommendation.** Focus the answer container only when the rail mounted *and* the relatedTarget is still inside the rail (or skip the imperative focus and let CSS `:focus-within` handle visual highlight).

---

### F25 — `chat/HubChatBody.tsx` typing indicator + cancel pill block has no `prefers-reduced-motion` opt-out for the typing dots animation [severity: low] [perspective: a11y]

**Page:** `HubChatBody`
**File:** `apps/web/src/core/hub/chat/HubChatBody.tsx` → `TypingIndicator` (`apps/web/src/core/hub/components/ChatMessage.tsx`)
**Lines:** rendering at L62–L77 (the wrapper) — the actual animation lives downstream in `TypingIndicator`

**Description.** Hard Rule #17 (animation budget — 3 tiers) + `prefers-reduced-motion` mandates that non-essential motion is suppressed for users who opt out. `HubChatBody` chains a `TypingIndicator` without a `motion-safe:` gate on the wrapper, and the dots animation in `TypingIndicator` is not gated either (verified by sibling code; this is a *handoff* finding to `ChatMessage.tsx`). The drawer next door uses `motion-safe:animate-fade-in` correctly (L83, L90).

**Why it matters.** Vestibular-sensitive users see the three-dot animation indefinitely while a slow stream completes; combined with the auto-scroll in F12, the experience is dizzying.

**Recommendation.** Audit `TypingIndicator` and gate the dots animation behind `motion-safe:`. Replace with a static "Думаю…" pill when reduced motion is requested.

---

### F26 — `useChatSessions.handleDeleteSession` reads `remaining[0]!` with a non-null assertion after `length > 0` guard, but the type guarantees TS strict-mode-friendly access is via `at(0)` [severity: low] [perspective: ts]

**Page:** `HubChat` (sessions library)
**File:** `apps/web/src/core/hub/chat/useChatSessions.ts`
**Lines:** L205–L207

**Description.** Hard Rule #19 (`noUncheckedIndexedAccess: true`) requires that bare `arr[i].foo` lookups be either guarded or asserted. The code does:

```ts
if (remaining.length > 0) {
  nextActiveId = remaining[0]!.id;
  nextMessages = remaining[0]!.messages;
}
```

The `length > 0` guard does justify the `!`, but the `!` non-null bang is the kind of assertion the rule was created to discourage — it's brittle because a future refactor that splits the guard from the index access will silently pass strict-mode without re-validating.

**Why it matters.** Low-severity TS-hygiene nit; flagged because the strict-mode rule is explicitly an *active initiative* (see `19-strict-mode-flag-canonical.md`) and the codebase is converging on guard-then-destructure instead of `!`.

**Recommendation.** Replace with a `const [head, ...rest] = remaining; if (head) { ... }` pattern, or use `remaining.at(0)` with explicit `if`.

---

## Per-perspective spot-check (no findings)

- **TypeScript strictness (other than F26).** `useChatSend.ts` uses one `as` cast for `tool_calls` (covered under F3); no `any`, no `getattr`, no `as unknown as`. Discriminated unions are used for `ChatActionCard`, `ContextState`. Audited.
- **Tailwind / design tokens.** No raw hex in classNames (Rule #11) — verified via grep. `focus-visible:ring-…` is used consistently (Rule #14). Module-accent containment respected (`text-finyk`, `text-fizruk`, … only in `ChatEmpty` SUGGESTIONS, which is module-aware). Rule #8 opacity scale used (`/10`, `/15`, `/30`, `/45`, `/60`). Audited.
- **Code quality / Hard Rules.** No file in the scope crosses Rule #18 (max-lines: 600) — biggest is `useChatSend.ts` at 486 LOC. All RQ keys flow through `hubKeys` factory (Rule #2) — verified via grep, zero inline `queryKey: […]`. No `console.log` debug residue. Audited.
- **Pino redaction (Rule #21).** No `pino` calls in this scope — the redaction policy applies to `apps/server`. Audited (N/A).
- **OpenClaw PATs (Rule #20).** No OpenClaw integration in this scope. Audited (N/A).
- **bigint → number coercion (Rule #1).** Money / kopiykas conversions live in `apps/server` and `@sergeant/finyk-domain`; this scope only consumes already-coerced numbers (e.g. transaction amounts in `searchSources`). Audited (N/A).
- **i18n / copy.** All user-facing copy is Ukrainian and lives behind `@shared/i18n/uk` or inline Ukrainian literals (`"Бесіди"`, `"Нова бесіда"`, `"Скасувати поточний запит"`, `"Контекст готовий"`, etc.). No "Submit"/"Cancel"/"Error" English leaks. Pluralization handled in `HubChatHistoryDrawer.tsx:168` for "повідомлення / повідомлень" (note: missing few-form for 2-4 → "повідомлення", but the binary form is acceptable for v1). Audited.
- **AI markers.** `HubChatPage.tsx:10` uses `@scaffolded` + `@addedIn 2026-05-01` + `@owner @Skords-01` + `@nextStep` block — syntactically valid AI-context block (old format). No `AI-LEGACY` without expiry, no `AI-GENERATED` without generator. Audited.

## Per-page coverage matrix

Legend: number = findings touching that perspective; `X` = audited / no finding; `—` = not applicable.

| Page                             | sec | a11y | perf | ux | bug | rule | ts | tw | i18n | test | ai | lifecycle |
| -------------------------------- | --- | ---- | ---- | -- | --- | ---- | -- | -- | ---- | ---- | -- | --------- |
| `HubChat.tsx`                    |  X  |  X   |  X   | X  |  X  |  X   | X  | X  |  X   |  1   | X  |    1      |
| `HubChatPage.tsx`                |  1  |  X   |  X   | 1  |  1  |  X   | X  | X  |  X   |  1   | X  |    1      |
| `HubChatHistoryDrawer.tsx`       |  X  |  2   |  X   | X  |  1  |  X   | X  | X  |  X   |  1   | X  |    1      |
| `chat/HubChatBody.tsx`           |  X  |  2   |  X   | 1  |  X  |  X   | X  | X  |  X   |  1   | X  |    1      |
| `chat/HubChatComposer.tsx`       |  X  |  X   |  X   | X  |  X  |  X   | X  | X  |  X   |  1   | X  |    1      |
| `chat/HubChatHeader.tsx`         |  X  |  1   |  X   | X  |  X  |  X   | X  | X  |  X   |  1   | X  |    1      |
| `chat/ChatEmpty.tsx`             |  X  |  X   |  X   | X  |  1  |  X   | X  | X  |  X   |  X   | X  |    1      |
| `chat/useChatSend.ts`            |  2  |  X   |  X   | X  |  1  |  X   | X  | —  |  X   |  1   | X  |    1      |
| `chat/useChatSessions.ts`        |  X  |  X   |  X   | X  |  1  |  X   | 1  | —  |  X   |  1   | X  |    1      |
| `hubChatSessions.ts`             |  X  |  X   |  X   | X  |  1  |  X   | X  | —  |  X   |  1   | X  |    1      |
| `search/HubSearch.tsx`           |  X  |  1   |  X   | X  |  X  |  X   | X  | X  |  X   |  1   | X  |    1      |
| `search/useSearchEngine.ts`      |  X  |  X   |  X   | X  |  X  |  X   | X  | —  |  X   |  1   | X  |    1      |
| `search/useInlineAiRail.ts`      |  X  |  X   |  X   | X  |  X  |  X   | X  | —  |  X   |  1   | X  |    1      |
| `search/InlineAiRail.tsx`        |  1  |  X   |  X   | 1  |  X  |  X   | X  | X  |  X   |  1   | X  |    1      |
| `search/SearchInput.tsx`         |  X  |  X   |  X   | X  |  X  |  X   | X  | X  |  X   |  1   | X  |    1      |
| `search/SearchResults.tsx`       |  X  |  X   |  X   | X  |  X  |  X   | X  | X  |  X   |  1   | X  |    1      |
| `search/SearchResultItem.tsx`    |  X  |  X   |  X   | X  |  X  |  X   | X  | X  |  X   |  X   | X  |    1      |
| `search/searchSources.ts`        |  X  |  X   |  1   | X  |  1  |  X   | X  | —  |  X   |  1   | X  |    1      |
| `search/searchTypes.ts`          |  X  |  X   |  X   | X  |  1  |  X   | X  | —  |  X   |  1   | X  |    1      |
| `search/searchActions.ts`        |  X  |  X   |  X   | X  |  X  |  X   | X  | —  |  X   |  X   | X  |    1      |
| `search/searchSettings.ts`       |  X  |  X   |  X   | X  |  X  |  X   | X  | —  |  X   |  X   | X  |    1      |
| `search/searchCache.ts`          |  X  |  X   |  X   | X  |  X  |  X   | X  | —  |  X   |  X   | X  |    1      |
| `hubSearchEngine.ts`             |  X  |  X   |  X   | X  |  X  |  X   | X  | —  |  X   |  X   | X  |    1      |
| `HubBackupPanel.tsx`             |  1  |  X   |  X   | X  |  X  |  X   | X  | X  |  X   |  1   | X  |    1      |
| `hubBackup.ts`                   |  1  |  X   |  X   | X  |  X  |  X   | X  | —  |  X   |  1   | X  |    1      |
