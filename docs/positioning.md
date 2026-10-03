# What Nudge is for

Written down because the product idea is sharper than the landing page
currently says, and because the distinction below is the thing that makes this
worth building at all.

## Not a planner

There are thousands of daily planners. They all serve the same person: someone
who sits down, lays the day out, and then executes it. That person is well
served already.

Nudge is for the other kind. Someone who is impromptu, on the go, and relies on
alarms. They hold intentions at the level of **category**, not clock time:

> "Today I want to meditate at some point. And work out, if there is time."

Not "meditation at 14:00, workout at 18:30". The decision of *when* is made in
the moment, when the gap appears. What they need at that moment is not a plan —
they already have the plan. They need the structure to run it, immediately,
without ten minutes of setup.

**Nudge is not for planning your day. It is for making the most of a plan you
already had in mind.**

## The two features everything else hangs off

### 1. Categorisation

Folders. Which sounds administrative until you see what it is actually for.

### 2. Repetition at any granularity

Every second, every minute, every hour, every day, every third Tuesday — in one
tool, with one mental model.

### What they are worth together

Separately each is unremarkable. Together they solve a problem no planner app
touches:

> You spend real time building an alarm. Then you delete it — because
> uncategorised alarms pile into a list so long it becomes useless, and the
> only way to keep the list usable is to throw things away. So the next time
> you want the same thing, you build it again from scratch.

Categorisation turns a single-use alarm into a **reusable preset**. The work you
did once is still there next week. That is the actual win, and it is currently
invisible on the landing page.

A folder is not a tag. A folder is a **routine you open when the moment
arrives**.

## Where this sits in the market

Honest framing, because the obvious claim does not survive contact with an
interviewer:

- **Interval timers** (Tabata apps, HIIT timers, watch workouts) do seconds
  well. They are single-session and disposable: you set one up, use it, and it
  is gone. No library, no recurrence, no life outside the gym.
- **Reminder and planner apps** do days and weeks well. None of them does
  seconds, because a calendar has no reason to.

Nudge is the space between: **a reusable library of interval routines, with
calendar-grade recurrence, and a voice.**

> **Careful with the claim.** "Second-level repetition is not offered anywhere
> else" is false — interval timers have done it for years. What is not offered
> anywhere else is *that granularity combined with folders, real recurrence and
> spoken custom messages in one tool*. Claim the combination, not the feature.

## What this unlocks, by granularity

The point of the table is that **one tool spans all of it**. Nothing else does.

### Seconds — the band nothing calendar-shaped can reach

| Routine | Shape |
| --- | --- |
| Squats | 30s work / 10s rest × 8 |
| Tabata | 20s / 10s × 8 |
| Plank ladder | 45s hold / 15s rest, climbing |
| Sprint intervals | 30s hard / 90s easy × 6 |
| Physio set | 20s hold per side, both sides, × 3 |
| Box breathing | 4s in / 7s hold / 8s out |
| Cooking | stir every 90s; flip every 45s |

### Minutes — focus and short cycles

| Routine | Shape |
| --- | --- |
| Pomodoro | 25 / 5 × 4, then 15 |
| 52/17 | 52 work / 17 off |
| Meditation with interior cues | 10 min, a cue every 2 |
| Active recall study | 20 read / 5 recall |
| Stretch sequence | 2 min per position × 6 |
| Medication spacing | every 20 min, four doses |

### Hours — the body inside a working day

| Routine | Shape |
| --- | --- |
| Stand and stretch | every 45–90 min, 09:00–18:00 |
| Eye rest | 20-20-20, through the working day |
| Hydration | every 90 min |
| Posture check | every hour |
| Caregiving check-in | every 3 hours |

### Days, weeks, months — the calendar layer

| Routine | Shape |
| --- | --- |
| Gym split | push / pull / legs on a 3-day cycle |
| Weekly planning | Sundays 19:00 |
| Bin day | every other Tuesday |
| Watering | every 5 days |
| Meter readings | monthly |
| The awkward one | every third Tuesday |

## The combinations worth building toward

These are where the two features multiply rather than add.

1. **Recurrence brings you to it, seconds run it.** A folder that fires on a
   schedule *and* contains an interval sequence. "Weekdays 07:00 → Morning
   mobility → 45s per position × 6." The calendar gets you there; the interval
   timer runs the session. Neither category of product does both.

2. **One alarm, a different message each repeat.** Already built. Inside an
   interval routine this stops being a nicety and becomes the interface:
   "left side", "switch", "last one", "you are done".

3. **Escalating insistence.** First repeat polite, third repeat not. See
   [ideas.md](ideas.md).

4. **Collision warnings matter more here than they look.** If an hourly
   stand-up alarm fires into the middle of a 30-second interval sequence, that
   is a real conflict, not a theoretical one. Nudge already detects it.

5. **Folders as shareable routines.** A coach, a physio or a teacher hands you
   a folder. The recipient does no setup at all. This is the strongest
   expansion path and needs nothing the data model does not already have.

6. **Presets as the primary verb.** If a folder is a routine you open when the
   moment arrives, the UI should probably say so. "Start routine" is a
   different product from "create alarm", built on the same tables.

## What the landing page should say that it currently does not

In rough priority:

1. **The reusability story.** Build it once, keep it, open it when the moment
   arrives. This is the sharpest idea in the whole product and it is not on the
   page at all.
2. **The granularity range, shown visually.** Seconds to months on one scale.
   It is the differentiator and it draws well.
3. **The positioning line.** Something close to: *Not a planner. For people who
   decide in the moment.*
4. Keep "a nudge, not a siren" — the voice is what makes any of it land.
