import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import type { RepeatMode, Sequence, SequenceList, StepKind } from '../api/types';

/**
 * Alarm configuration: sequences.
 *
 * A sequence is a chain that runs on relative time — it starts when Activate
 * is pressed and each step begins when the one before it ends. That is the
 * whole difference from the rest of the application, where an alarm fires at a
 * time of day, and it is why this has a page of its own rather than a section
 * on the alarms page: nothing here has a date, a timezone or a recurrence.
 */

interface DraftStep {
  kind: StepKind;
  label: string;
  duration: string;
  speechText: string;
}

const BLANK_STEP: DraftStep = { kind: 'action', label: '', duration: '30', speechText: '' };

/** Seconds as something a person reads: 2700 is "45m", not 2700. */
function readable(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const spare = minutes % 60;
  return spare ? `${hours}h ${spare}m` : `${hours}h`;
}

function RunningFor({ sequence }: { sequence: Sequence }) {
  const run = sequence.activeRun;
  if (!run) return null;

  const started = new Date(run.startedAt);
  const ends = new Date(run.endsAt);

  return (
    <p className="field-hint" data-testid="sequence-run-state">
      Running since {started.toLocaleTimeString()}, until {ends.toLocaleTimeString()}.
    </p>
  );
}

export function SequencesPage() {
  const queryClient = useQueryClient();

  const sequences = useQuery({
    queryKey: ['sequences'],
    queryFn: () => api.get<SequenceList>('/sequences'),
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('once');
  const [repeatMinutes, setRepeatMinutes] = useState('480');
  const [repeatCount, setRepeatCount] = useState('3');
  const [closingText, setClosingText] = useState('');
  const [steps, setSteps] = useState<DraftStep[]>([{ ...BLANK_STEP }]);
  const [problem, setProblem] = useState<string | undefined>();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['sequences'] });
    // The scheduler's own poll, so an activated sequence starts speaking
    // without waiting for the next interval.
    void queryClient.invalidateQueries({ queryKey: ['upcoming'] });
  };

  const create = useMutation({
    mutationFn: () =>
      api.post<Sequence>('/sequences', {
        name,
        repeatMode,
        ...(repeatMode === 'duration'
          ? { repeatSeconds: Math.max(1, Number(repeatMinutes) * 60) }
          : {}),
        ...(repeatMode === 'count' ? { repeatCount: Number(repeatCount) } : {}),
        ...(closingText.trim() ? { closingText: closingText.trim() } : {}),
        steps: steps.map((step) => ({
          kind: step.kind,
          label: step.label.trim(),
          durationSeconds: Number(step.duration),
          speechText: step.kind === 'pause' || !step.speechText.trim() ? null : step.speechText.trim(),
        })),
      }),
    onSuccess: () => {
      setOpen(false);
      setName('');
      setClosingText('');
      setSteps([{ ...BLANK_STEP }]);
      setProblem(undefined);
      invalidate();
    },
    onError: (error) =>
      setProblem(error instanceof ApiError ? error.message : 'Could not create the sequence.'),
  });

  const activate = useMutation({
    mutationFn: (id: string) => api.post<Sequence>(`/sequences/${id}/activate`),
    onSuccess: invalidate,
    onError: (error) =>
      setProblem(error instanceof ApiError ? error.message : 'Could not start the sequence.'),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api.post<Sequence>(`/sequences/${id}/deactivate`),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<null>(`/sequences/${id}`),
    onSuccess: invalidate,
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(undefined);

    if (!name.trim()) {
      setProblem('Give the sequence a name.');
      return;
    }
    if (steps.some((step) => !step.label.trim())) {
      setProblem('Every step needs a label.');
      return;
    }
    create.mutate();
  }

  const items = sequences.data?.items ?? [];
  const total = steps.reduce((sum, step) => sum + (Number(step.duration) || 0), 0);

  return (
    <main className="page" data-testid="sequences-page">
      <header className="page-header">
        <div>
          <h1>Alarm configuration</h1>
          <p className="page-lede">
            A sequence is a chain of steps that runs when you start it — each step begins
            when the one before it ends.
          </p>
        </div>
        <button
          type="button"
          className="button button-primary"
          onClick={() => setOpen((was) => !was)}
          data-testid="sequence-create-open-button"
        >
          {open ? 'Cancel' : 'New sequence'}
        </button>
      </header>

      {problem ? (
        <p className="alert alert-error" role="alert" data-testid="sequence-error">
          {problem}
        </p>
      ) : null}

      {open ? (
        <form className="card form" onSubmit={onSubmit} noValidate data-testid="sequence-form">
          <div className="field">
            <label htmlFor="sequence-name">Name</label>
            <input
              id="sequence-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Morning stretch"
              data-testid="sequence-name-input"
            />
          </div>

          <div className="field">
            <label htmlFor="sequence-repeat-mode">When it ends</label>
            <select
              id="sequence-repeat-mode"
              value={repeatMode}
              onChange={(event) => setRepeatMode(event.target.value as RepeatMode)}
              data-testid="sequence-repeat-mode-select"
            >
              <option value="once">After one pass</option>
              <option value="duration">After a length of time</option>
              <option value="count">After a number of passes</option>
            </select>
          </div>

          {repeatMode === 'duration' ? (
            <div className="field">
              <label htmlFor="sequence-repeat-minutes">Keep going for (minutes)</label>
              <input
                id="sequence-repeat-minutes"
                type="number"
                min={1}
                value={repeatMinutes}
                onChange={(event) => setRepeatMinutes(event.target.value)}
                data-testid="sequence-repeat-minutes-input"
              />
            </div>
          ) : null}

          {repeatMode === 'count' ? (
            <div className="field">
              <label htmlFor="sequence-repeat-count">Number of passes</label>
              <input
                id="sequence-repeat-count"
                type="number"
                min={1}
                value={repeatCount}
                onChange={(event) => setRepeatCount(event.target.value)}
                data-testid="sequence-repeat-count-input"
              />
            </div>
          ) : null}

          <fieldset className="fieldset" data-testid="sequence-steps-fieldset">
            <legend>The chain</legend>

            {steps.map((step, index) => (
              <div className="sequence-step-row" key={index} data-testid="sequence-step-row">
                <span className="sequence-step-position">{index + 1}</span>

                <div className="field">
                  <label htmlFor={`step-kind-${index}`}>Kind</label>
                  <select
                    id={`step-kind-${index}`}
                    value={step.kind}
                    onChange={(event) =>
                      setSteps((was) =>
                        was.map((other, at) =>
                          at === index ? { ...other, kind: event.target.value as StepKind } : other,
                        ),
                      )
                    }
                    data-testid="sequence-step-kind-select"
                  >
                    <option value="action">Action</option>
                    <option value="pause">Pause</option>
                  </select>
                </div>

                <div className="field">
                  <label htmlFor={`step-label-${index}`}>Label</label>
                  <input
                    id={`step-label-${index}`}
                    value={step.label}
                    onChange={(event) =>
                      setSteps((was) =>
                        was.map((other, at) =>
                          at === index ? { ...other, label: event.target.value } : other,
                        ),
                      )
                    }
                    placeholder={step.kind === 'pause' ? 'Pause' : 'Back stretch'}
                    data-testid="sequence-step-label-input"
                  />
                </div>

                <div className="field">
                  <label htmlFor={`step-duration-${index}`}>Seconds</label>
                  <input
                    id={`step-duration-${index}`}
                    type="number"
                    min={1}
                    value={step.duration}
                    onChange={(event) =>
                      setSteps((was) =>
                        was.map((other, at) =>
                          at === index ? { ...other, duration: event.target.value } : other,
                        ),
                      )
                    }
                    data-testid="sequence-step-duration-input"
                  />
                </div>

                {step.kind === 'action' ? (
                  <div className="field">
                    <label htmlFor={`step-speech-${index}`}>Say</label>
                    <input
                      id={`step-speech-${index}`}
                      value={step.speechText}
                      onChange={(event) =>
                        setSteps((was) =>
                          was.map((other, at) =>
                            at === index ? { ...other, speechText: event.target.value } : other,
                          ),
                        )
                      }
                      placeholder="Back stretch"
                      data-testid="sequence-step-speech-input"
                    />
                  </div>
                ) : null}

                <button
                  type="button"
                  className="button"
                  // The chain needs at least one step; the API refuses an
                  // empty one, and offering a button that cannot work is worse
                  // than not offering it.
                  disabled={steps.length === 1}
                  onClick={() => setSteps((was) => was.filter((_, at) => at !== index))}
                  data-testid="sequence-step-remove-button"
                >
                  Remove
                </button>
              </div>
            ))}

            <button
              type="button"
              className="button"
              onClick={() => setSteps((was) => [...was, { ...BLANK_STEP }])}
              data-testid="sequence-step-add-button"
            >
              Add a step
            </button>

            <p className="field-hint" data-testid="sequence-cycle-total">
              One pass takes {readable(total)}.
            </p>
          </fieldset>

          <div className="field">
            <label htmlFor="sequence-closing">Say at the end (optional)</label>
            <input
              id="sequence-closing"
              value={closingText}
              onChange={(event) => setClosingText(event.target.value)}
              placeholder="You're done for the day"
              data-testid="sequence-closing-input"
            />
          </div>

          <button
            type="submit"
            className="button button-primary"
            disabled={create.isPending}
            data-testid="sequence-submit-button"
          >
            {create.isPending ? 'Creating…' : 'Create sequence'}
          </button>
        </form>
      ) : null}

      {sequences.isPending ? <p>Loading…</p> : null}

      {!sequences.isPending && items.length === 0 ? (
        <p className="empty" data-testid="sequences-empty">
          No sequences yet. A sequence is a chain of steps — a stretch routine, or a
          reminder to stand up every so often — that runs when you start it.
        </p>
      ) : null}

      <ul className="card-list" data-testid="sequence-list">
        {items.map((sequence) => (
          <li className="card" key={sequence.id} data-testid="sequence-row">
            <div className="card-main">
              <h2 data-testid="sequence-name">{sequence.name}</h2>
              <p className="field-hint">
                {sequence.steps.length} step{sequence.steps.length === 1 ? '' : 's'},{' '}
                {readable(sequence.cycleSeconds)} a pass
                {sequence.repeatMode === 'duration'
                  ? `, repeating for ${readable(sequence.runSeconds)}`
                  : null}
                {sequence.repeatMode === 'count' ? `, ${sequence.repeatCount} passes` : null}
              </p>

              <ol className="sequence-chain" data-testid="sequence-chain">
                {sequence.steps.map((step) => (
                  <li key={step.id} data-testid="sequence-chain-step">
                    <span className="sequence-chain-label">{step.label}</span>
                    <span className="field-hint"> {readable(step.durationSeconds)}</span>
                    {step.speechText ? (
                      <span className="field-hint"> — “{step.speechText}”</span>
                    ) : null}
                  </li>
                ))}
              </ol>

              <RunningFor sequence={sequence} />
            </div>

            <div className="card-actions">
              {sequence.activeRun ? (
                <button
                  type="button"
                  className="button"
                  onClick={() => deactivate.mutate(sequence.id)}
                  data-testid="sequence-deactivate-button"
                >
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => activate.mutate(sequence.id)}
                  data-testid="sequence-activate-button"
                >
                  Activate
                </button>
              )}
              <button
                type="button"
                className="button"
                // Deleting a running sequence would leave the browser holding
                // timers for a chain that no longer exists.
                disabled={sequence.activeRun !== null}
                onClick={() => remove.mutate(sequence.id)}
                data-testid="sequence-delete-button"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
