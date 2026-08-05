# The editor explains itself, and grading stops going through Claude

**Status:** agreed 2026-08-04, not yet built. Two features, deliberately in one
doc: they are independent to build but come from the same complaint — the editor
makes the user leave the editor.

---

## Feature 1 — the hint bar says why a drag stopped

### The report

> když editor zabrání dalšímu tažení handles, na dolní hint liště se dočasně
> místo hintů zobrazí vysvětlení proč to dál nejde, to jinak bude obecně
> fungovat i jako error lišta

### What happens today

Drag a trim handle past what the footage can give and it simply stops. The
adapter is right to stop it — but nothing says which of the several possible
limits was hit, so the user cannot tell a constraint from a bug. This is the
same failure class as the brand lane (a surface whose behaviour the UI does not
explain), and it is precisely why [[transition-handle-starvation]] took so long
to become legible.

The limits that can stop a drag today, all already computed:

| Reason | Where it is decided |
|---|---|
| The source has no more frames to give | `clipFootageCapMs` (`lib/editor/src/timeline/layered-adapter.ts`) |
| The clip would go below the minimum length | `MIN_CLIP_MS`, same file |
| A neighbour is in the way (overwrite / ripple off) | `resizeBoundsMs` / `overwriteNeighbours` |
| A transition needs frames the neighbour cannot lend | handle-room maths (`handle-room.ts`) |
| The timeline start (0) | `resizeBoundsMs` |

Every one of these is known at the moment of the clamp **and thrown away** — the
functions return the clamped position only.

### The decision

1. The clamp path returns a **reason code**, not a message. Codes are UI-agnostic
   (`footage-exhausted`, `min-clip-length`, `neighbour-blocked`,
   `transition-handle`, `timeline-start`); the app layer owns the English copy.
   Wording in `lib/editor/src/timeline/` would be the wrong layer and would put
   user-facing strings in the module the render side also reads.
2. The **bottom hint bar** takes a transient message that replaces the shortcut
   hints, then restores them. Same surface, later, for errors — so give it a
   severity (`info` | `warn` | `error`) from the start rather than retrofitting.
3. **The message latches.** A pointer held past the cap fires the clamp on every
   move event; the bar must not re-render per event nor flicker off between them.
   Latch while the drag continues, clear shortly after release (the copy button's
   1.2 s confirmation is the precedent).

### Open, decide when building

- Does a blocked drag deserve any non-textual signal (a handle tint)? Probably,
  but not in the first pass — the bar is the ask.
- The transition-handle case is the one where the *fix* is not obvious to the
  user ("shift the window", not "trim less"). Its copy has to carry that, which
  is a wording problem, not a plumbing one.

### Sketch of the work

1. Reason codes out of `resizeBoundsMs` / `clipFootageCapMs` (pure, unit-tested —
   the existing bounds tests already construct every one of these situations, so
   this is mostly asserting a second return field).
2. Hint-bar component takes `{ text, severity }` with a latch + auto-clear; test
   the latch by firing repeated clamps and asserting one message, no flicker.
3. Wire the timeline's drag path to publish the code; map codes → copy in one
   table, and pin that every code has copy (a derived test, so a new code cannot
   ship mute).

---

## Feature 2 — grading without a round-trip through Claude

### The report

> hodila by se rychlá cesta jak u color/crop&zoom jednak kopírovat a pastovat
> styly, ale i udělat mass copy na všechny klipy stejného typu (použít pro
> všechny), nebo nějakou jinou vhodnou cestu jak udělat úvodní grading bez
> nutnosti si to vyměňovat s claudem

### What happened today

The user graded `seg-001` in the editor (`contrast 1.2, saturation 1.05,
temperature 0.1`) and then asked Claude to copy that literal onto the other five
talking-head clips. It worked, but the editor made them leave the editor to do
a thing the editor is for.

### The decision

Two halves, and the second is the one that actually removes the round-trip:

**a) Copy / paste a style** — the Color and Crop & zoom section headers get
copy/paste. An in-editor clipboard (host state), not the OS clipboard: no
serialization contract, no cross-app surprises. Colour and framing are
**separate** clipboards.

**b) A reel-level default look** — the reel gains a default grade that clips
inherit and may override per clip. This is the architecturally clean answer and
matches [[simplified-editor-real-model-brand-presets]]: copying one literal onto
six clips is the model failing to have a place to say "this reel looks like
this". With it, the initial grading is one edit, and "apply to all" stops being
the primary path.

**Colour and framing are not symmetric, and the UI must not pretend they are.**
One grade suits every talking head; one crop suits exactly the shot it was set
on. So: "apply to all clips of this kind" belongs on Color, and on Crop & zoom
it is at best a rare convenience — offer it only if it proves wanted, and never
as the prominent action.

### Decided (user, 2026-08-05)

**The default grade lives on the reel.** Not in the brand theme — a brand edit
must not silently move the look of reels already finished. The brand may supply
the initial value at cut time; after that the reel owns it.

**A clip overrides it explicitly**, behind a "customize" affordance (checkbox or
button group) rather than by editing fields that silently fork from the default.

That affordance also settles the merge question, and the plan should read it
this way unless told otherwise: a clip is EITHER following the reel default OR
carrying its own grade. No partial merge — "customize" is a switch, so the
inspector can always answer "where does this clip's look come from?" with one
word instead of a computation. Turning it off must restore the default rather
than leave the forked values behind.

### Still open, decide when building

- "Clips of this kind" — kind (`clip` / `broll`) is the obvious grouping and was
  the right one on 2026-08-04, but source-based ("every clip from
  56_upright.mp4") is sometimes what is meant. Kind first.
- Whether a reel-level default makes per-clip copy/paste redundant enough to
  ship (b) alone first. Probably not — copy/paste still answers "make THIS clip
  look like THAT one", which the default cannot.

### What this must not break

- The editor writes `Root.tsx` literals. A derived/inherited grade must be
  explicit in what is written, or a render outside the editor disagrees with the
  preview — the exact class of defect the brand lane just cost a day on.
- `deriveLayered` (cut time) has to seed the same default, or the first Save
  after a cut silently changes the look.

---

---

## Feature 3 — framing edits a clip you may not be looking at

### The report

> crop + position nyní funguje na VYBRANEM klipu, i když playhead je jinde — to
> je dosti matoucí a chce to převymyslet

### What happens today

The Crop and Position gesture modes act on the **selected** clip
(`framingMode` + `attachCropGestures` in `lib/editor/host/EditorHost.tsx`), while
the preview shows the frame **at the playhead**. Select a clip, leave the
playhead somewhere else, arm Crop — and you are dragging one clip's framing on
top of a completely different picture. Nothing is wrong with the edit that
lands; it is simply invisible while you make it, which is worse.

### The tension

Selection and playhead are two different cursors, and framing is the one edit
that needs them to agree: every other inspector control edits data you can read
as numbers, but framing is judged by eye, against the picture.

Four ways out, none free:

| | Approach | Cost |
|---|---|---|
| a | Arming framing **seeks the playhead into the selected clip** (its midpoint, or the nearer edge) | Moves the user's playhead — a side effect they did not ask for |
| b | Framing follows the **playhead**, not the selection | Two cursors now disagree about what "current clip" means, everywhere else in the UI |
| c | **Refuse** to arm when the playhead is outside the clip, and say why | Honest, but a dead control plus an extra step |
| d | The preview **locks to the selected clip** while framing is armed | A second preview mode; the timeline cursor then lies about what is on screen |

### Ratified by the user, 2026-08-05

> Souhlas, při aktivním crop/position by playhead měla vždy ukazovat na ten
> klip, kterého se to týká.

The invariant to implement, stated as an invariant rather than as a seek:
**while Crop or Position is armed, the playhead is inside the clip being
framed.** Arming when it is outside seeks it in (and the bar says so); the
playhead leaving the clip while armed ends the mode, because that is the only
other way to keep the invariant true. Do not implement "seek once on arm" alone
— that satisfies the letter and breaks the moment the user scrubs.

### The reasoning behind it

**(a), with a guard.** Arming Crop/Position seeks the playhead into the selected
clip when it is outside it, and the bottom bar — the same surface Feature 1
builds — says that it did. Moving the playhead out of the clip while framing is
armed disarms the mode rather than silently continuing to edit an unseen clip.

It keeps one cursor authoritative (selection), it never edits something
invisible, and the "surprise" it costs is a single seek that the bar explains.
(b) reads cleaner in the abstract but changes what "current clip" means for the
inspector, the delete key and the split key too — a much larger blast radius
than this complaint justifies.

**Needs the user's yes before implementation** — it changes what a click does,
and that is exactly the kind of thing this project stops and asks about.

---

## Order

Feature 1 first: it is smaller, self-contained, and its reason codes are already
computed. Feature 3 is next and should reuse Feature 1's bar rather than
inventing a second explanation surface — which is also why it is not worth
starting before it. Feature 2 is unblocked (the schema decision is made above)
but is the largest of the three.
