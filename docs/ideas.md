# Ideas not yet built

Captured so they are not lost. Nothing here is committed to, and nothing here
has been designed beyond the notes below.

## Alarms as a productivity tracker

The largest idea, and the one the rest would hang off.

An alarm stops being only a reminder and becomes a **task with an outcome**.
"Ten squats every 45 minutes from 07:00 to 20:00" is already expressible today —
that is a daily rule with a within-day window. What is missing is what happens
*after* it fires.

The shape, as described:

1. The alarm fires and says what to do.
2. Some minutes later a **second** notification asks whether it was done.
3. The answer is recorded against that specific occurrence.
4. Those answers add up into a day's score, and days add up into a week.
5. A calendar or tracker view shows how much was actually accomplished.

### What already supports this

**Occurrences have a stable identity without being stored.** An occurrence is
uniquely `(alarmId, utc)`, and the engine already reports `indexInDay` and
`countInDay` for each one. A completion table keyed on that pair needs no change
to how occurrences are computed, and does not require materialising a schedule
in advance.

**The density ceiling is not in the way.** Every 45 minutes across 13 hours is
18 occurrences a day, nowhere near the 4,000 limit.

**The spoken message already adapts** — "your third of eighteen" — which is
most of what a tracker would want to say.

### What it would need

**A completions table**, something like
`(alarm_id, occurrence_utc, completed, answered_at)`, with the pair as the
primary key. Natural and cheap.

**A follow-up offset on the alarm**: ask again *N* minutes after it fires. The
engine computes occurrences; the follow-up is just an occurrence plus an offset,
so this is a scheduling detail rather than new machinery.

**Web Push.** This is the real blocker. A tracker that only works while a tab
happens to be open is not a tracker — the whole point is that it finds you
during the day. That needs a service worker, VAPID keys, and a server that does
not sleep. It is the strongest argument yet for the paid instance.

### Questions that would need answering

**What happens to past completions when an alarm is edited?** If the time
changes, `(alarmId, utc)` no longer matches anything, and a week's history
silently detaches. Options: freeze completions against a snapshot of the alarm,
version alarms, or accept the detachment and say so. This is the decision most
likely to be regretted if made carelessly.

**What counts as a missed one?** An occurrence nobody answered is not obviously
a failure — the person may have been asleep, or the browser shut. A tracker that
scores silence as failure will be wrong often enough to be distrusted.

**Does a disabled or deleted alarm keep its history?** Deleting an alarm
currently cascades. History probably should not vanish with it.

## Describing a plan in words

"Squats every 45 minutes between 08:00 and 20:00, five days a week, from this
date to that one" turned into alarms automatically.

This is a language model call, which means an API key, a cost per request, and
another runtime dependency on a third party — the same trade already made for
email and speech. It is also the one feature here that is purely additive: it
would produce ordinary alarms through the ordinary endpoints, so it could be
built last and removed without touching anything else.

Worth noting it inverts the testing problem. Everything else in this
application is deterministic by design; a model's output is not. It would want
its own seam — a fake planner that returns fixed alarms for fixed phrases — in
the same way the mock speech provider and the capture mail transport work.

## Escalating voice intensity

Discussed alongside the spoken messages: each repetition more insistent than the
last. ElevenLabs exposes `stability` and `style` per request, so intensity could
ramp with `indexInDay`. The browser's own voices have no equivalent, so this
would only work with a provider configured, and would need to degrade quietly
without one.

## Accessibility as a product feature

Not the same thing as accessibility testing, which checks that the existing
interface can be used by everyone. This is about building for it deliberately.

An alarm app has an unusual advantage here: its primary output is already
**spoken**. A product whose core interaction is "a voice tells you something"
is most of the way to being usable without sight, which is not true of most
software. The gap is the configuration side, not the alarm side.

What that would mean concretely:

- A high-contrast theme, and one that respects `prefers-contrast`.
- Larger type and spacing as a setting rather than a browser zoom.
- Colour never carrying meaning on its own — the conflict warning and the
  disabled state both lean on colour today.
- The whole create-an-alarm flow operable by keyboard end to end, and announced
  sensibly by a screen reader.
- Possibly: the application reading its own interface aloud, reusing the speech
  provider it already has.

The last one is the interesting one, because the machinery exists. Nothing else
in the backlog reuses so much of what is already built.

## A planner that writes alarms from a prompt

Mentioned alongside the natural-language idea above: a chat surface where
someone describes a routine — "remind me to stretch every fifty minutes while
I'm working" — and gets the alarms created for them.

Same caveats as the natural-language planner: a model call, an API key, a cost
per request, and output that is not deterministic. It would want the same seam
— a fake planner returning fixed alarms for fixed phrases — so the rest of the
suite stays repeatable.
