import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import {
  describeRule,
  type Alarm,
  type AlarmDraft,
  type Rule,
  type Weekday,
} from '../api/types';
import { OccurrencePreview } from '../components/OccurrencePreview';
import { useToast } from '../components/Toaster';

/**
 * A-03: a four-step create wizard whose draft lives on the server. Every step
 * transition writes the draft, so a reload — even in a different tab — resumes
 * where the user left off.
 *
 * Editing an existing alarm reuses the same steps but never touches the draft:
 * a half-finished edit has somewhere to live already, namely the saved alarm.
 */

const STEPS = ['Basics', 'Schedule', 'Repetition', 'Review'] as const;
const WEEKDAYS: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

interface WizardForm {
  folderId: string;
  name: string;
  note: string;
  timeOfDay: string;
  timezone: string;
  startDate: string;
  endMode: 'never' | 'date' | 'count';
  endDate: string;
  endAfterOccurrences: string;
  rule: Rule;
}

function emptyForm(folderId: string): WizardForm {
  return {
    folderId,
    name: '',
    note: '',
    timeOfDay: '07:00',
    timezone: 'America/Toronto',
    startDate: new Date().toISOString().slice(0, 10),
    endMode: 'never',
    endDate: '',
    endAfterOccurrences: '',
    rule: { type: 'daily' },
  };
}

function formFromAlarm(alarm: Alarm): WizardForm {
  return {
    folderId: alarm.folderId,
    name: alarm.name,
    note: alarm.note ?? '',
    timeOfDay: alarm.timeOfDay,
    timezone: alarm.timezone,
    startDate: alarm.startDate,
    endMode: alarm.endDate ? 'date' : alarm.endAfterOccurrences ? 'count' : 'never',
    endDate: alarm.endDate ?? '',
    endAfterOccurrences: alarm.endAfterOccurrences?.toString() ?? '',
    rule: alarm.rule,
  };
}

/** The request body, with the end mode collapsed into the two exclusive fields. */
function toPayload(form: WizardForm) {
  return {
    folderId: form.folderId,
    name: form.name.trim(),
    note: form.note.trim() ? form.note.trim() : null,
    timeOfDay: form.timeOfDay,
    timezone: form.timezone,
    startDate: form.startDate,
    endDate: form.endMode === 'date' && form.endDate ? form.endDate : null,
    endAfterOccurrences:
      form.endMode === 'count' && form.endAfterOccurrences
        ? Number.parseInt(form.endAfterOccurrences, 10)
        : null,
    rule: form.rule,
  };
}

export function WizardPage({ mode }: { mode: 'create' | 'edit' }) {
  const params = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const alarmId = params.alarmId;
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<WizardForm>(() => emptyForm(params.folderId ?? ''));
  const [hydrated, setHydrated] = useState(false);

  const existing = useQuery({
    queryKey: ['alarm', alarmId],
    enabled: mode === 'edit' && Boolean(alarmId),
    queryFn: () => api.get<Alarm>(`/alarms/${alarmId}`),
  });

  const draft = useQuery({
    queryKey: ['alarm-draft'],
    enabled: mode === 'create',
    queryFn: () => api.get<{ draft: AlarmDraft | null }>('/me/alarm-draft'),
  });

  /*
   * Restore whichever source this mode uses, exactly once.
   *
   * This runs during render rather than inside an effect. React applies a
   * state update made while rendering before it commits, so there is no
   * cascading render and no flash of the empty form; an effect would produce
   * both. It fires once because `hydrated` is set in the same pass.
   */
  const sourceReady = mode === 'edit' ? Boolean(existing.data) : draft.isFetched;

  if (sourceReady && !hydrated) {
    setHydrated(true);

    if (mode === 'edit' && existing.data) {
      setForm(formFromAlarm(existing.data));
    } else {
      const saved = draft.data?.draft;
      if (saved && typeof saved.payload === 'object') {
        setForm({ ...emptyForm(params.folderId ?? ''), ...(saved.payload as Partial<WizardForm>) });
        setStep(saved.step);
      }
    }
  }

  const saveDraft = useMutation({
    mutationFn: (next: { step: number; payload: WizardForm }) =>
      api.put<{ draft: AlarmDraft }>('/me/alarm-draft', next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alarm-draft'] }),
  });

  const discardDraft = useMutation({
    mutationFn: () => api.delete<void>('/me/alarm-draft'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alarm-draft'] }),
  });

  const submit = useMutation({
    mutationFn: () =>
      mode === 'create'
        ? api.post<Alarm>('/alarms', toPayload(form))
        : api.put<Alarm>(`/alarms/${alarmId}`, toPayload(form)),
    onSuccess: async (alarm) => {
      if (mode === 'create') await discardDraft.mutateAsync();
      await queryClient.invalidateQueries({ queryKey: ['alarms'] });
      await queryClient.invalidateQueries({ queryKey: ['conflicts', alarm.folderId] });
      toast.push('success', `"${alarm.name}" ${mode === 'create' ? 'created' : 'saved'}.`);
      void navigate(`/folders/${alarm.folderId}`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        // R-08 and R-09 both land here; the message already names the other alarm.
        toast.push('error', error.message);
      }
    },
  });

  const error = submit.error instanceof ApiError ? submit.error : undefined;
  const update = (patch: Partial<WizardForm>) => setForm((current) => ({ ...current, ...patch }));

  function goTo(next: number) {
    setStep(next);
    // The draft is written on every step transition, not only at the end.
    if (mode === 'create') saveDraft.mutate({ step: next, payload: form });
  }

  return (
    <main className="page" data-testid="wizard-page">
      <h1 className="page-title">{mode === 'create' ? 'New alarm' : `Edit ${form.name}`}</h1>

      <ol className="wizard-steps" data-testid="wizard-steps">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={`wizard-step ${index + 1 === step ? 'wizard-step-current' : ''}`}
            aria-current={index + 1 === step ? 'step' : undefined}
            data-testid="wizard-step"
            data-step={index + 1}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {error && error.status !== 409 ? (
        <p className="alert alert-error" role="alert" data-testid="wizard-error">
          {error.message}
        </p>
      ) : null}

      <section className="card form" data-testid={`wizard-step-${step}-panel`}>
        {step === 1 ? (
          <>
            <div className="field">
              <label htmlFor="alarm-name">Name</label>
              <input
                id="alarm-name"
                value={form.name}
                maxLength={80}
                onChange={(event) => update({ name: event.target.value })}
                aria-invalid={error?.fieldError('name') ? true : undefined}
                aria-describedby={error?.fieldError('name') ? 'alarm-name-error' : undefined}
                data-testid="alarm-name-input"
              />
              {error?.fieldError('name') ? (
                <p id="alarm-name-error" className="field-error" data-testid="alarm-name-error">
                  {error.fieldError('name')}
                </p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="alarm-note">Note (optional)</label>
              <input
                id="alarm-note"
                value={form.note}
                maxLength={500}
                onChange={(event) => update({ note: event.target.value })}
                data-testid="alarm-note-input"
              />
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="field">
              <label htmlFor="alarm-time">Time of day</label>
              <input
                id="alarm-time"
                type="time"
                value={form.timeOfDay}
                onChange={(event) => update({ timeOfDay: event.target.value })}
                aria-invalid={error?.fieldError('timeOfDay') ? true : undefined}
                aria-describedby={error?.fieldError('timeOfDay') ? 'alarm-time-error' : undefined}
                data-testid="alarm-time-input"
              />
              {error?.fieldError('timeOfDay') ? (
                <p id="alarm-time-error" className="field-error" data-testid="alarm-time-error">
                  {error.fieldError('timeOfDay')}
                </p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="alarm-timezone">Time zone</label>
              <input
                id="alarm-timezone"
                list="timezone-options"
                value={form.timezone}
                onChange={(event) => update({ timezone: event.target.value })}
                aria-invalid={error?.fieldError('timezone') ? true : undefined}
                aria-describedby={error?.fieldError('timezone') ? 'alarm-timezone-error' : undefined}
                data-testid="alarm-timezone-input"
              />
              <datalist id="timezone-options">
                {(Intl.supportedValuesOf?.('timeZone') ?? []).map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
              {error?.fieldError('timezone') ? (
                <p id="alarm-timezone-error" className="field-error" data-testid="alarm-timezone-error">
                  {error.fieldError('timezone')}
                </p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="alarm-start-date">Start date</label>
              <input
                id="alarm-start-date"
                type="date"
                value={form.startDate}
                onChange={(event) => update({ startDate: event.target.value })}
                data-testid="alarm-start-date-input"
              />
            </div>

            <fieldset className="fieldset">
              <legend>Ends</legend>
              {(['never', 'date', 'count'] as const).map((value) => (
                <label key={value} className="radio-row">
                  <input
                    type="radio"
                    name="end-mode"
                    value={value}
                    checked={form.endMode === value}
                    onChange={() => update({ endMode: value })}
                    data-testid={`alarm-end-mode-${value}-radio`}
                  />
                  {value === 'never' ? 'Never' : value === 'date' ? 'On a date' : 'After a number of occurrences'}
                </label>
              ))}
            </fieldset>

            {form.endMode === 'date' ? (
              <div className="field">
                <label htmlFor="alarm-end-date">End date</label>
                <input
                  id="alarm-end-date"
                  type="date"
                  value={form.endDate}
                  onChange={(event) => update({ endDate: event.target.value })}
                  aria-invalid={error?.fieldError('endDate') ? true : undefined}
                  aria-describedby={error?.fieldError('endDate') ? 'alarm-end-date-error' : undefined}
                  data-testid="alarm-end-date-input"
                />
                {/* R-01 arrives from the server attached to endDate. */}
                {error?.fieldError('endDate') ? (
                  <p id="alarm-end-date-error" className="field-error" data-testid="alarm-end-date-error">
                    {error.fieldError('endDate')}
                  </p>
                ) : null}
              </div>
            ) : null}

            {form.endMode === 'count' ? (
              <div className="field">
                <label htmlFor="alarm-end-count">Number of occurrences</label>
                <input
                  id="alarm-end-count"
                  type="number"
                  min={1}
                  max={1000}
                  value={form.endAfterOccurrences}
                  onChange={(event) => update({ endAfterOccurrences: event.target.value })}
                  aria-describedby={
                    error?.fieldError('endAfterOccurrences') ? 'alarm-end-count-error' : undefined
                  }
                  data-testid="alarm-end-count-input"
                />
                {error?.fieldError('endAfterOccurrences') ? (
                  <p id="alarm-end-count-error" className="field-error" data-testid="alarm-end-count-error">
                    {error.fieldError('endAfterOccurrences')}
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {step === 3 ? <RepetitionStep form={form} update={update} error={error} /> : null}

        {step === 4 ? (
          <>
            <dl className="review-list" data-testid="wizard-review">
              <dt>Name</dt>
              <dd data-testid="review-name">{form.name || '—'}</dd>
              <dt>Time</dt>
              <dd data-testid="review-time">
                {form.timeOfDay} {form.timezone}
              </dd>
              <dt>Starts</dt>
              <dd data-testid="review-start">{form.startDate}</dd>
              <dt>Ends</dt>
              <dd data-testid="review-end">
                {form.endMode === 'never'
                  ? 'Never'
                  : form.endMode === 'date'
                    ? form.endDate || '—'
                    : `After ${form.endAfterOccurrences || '—'} occurrences`}
              </dd>
              <dt>Repeats</dt>
              <dd data-testid="review-rule">{describeRule(form.rule)}</dd>
            </dl>

            <OccurrencePreview
              request={{
                timeOfDay: form.timeOfDay,
                timezone: form.timezone,
                startDate: form.startDate,
                endDate: form.endMode === 'date' && form.endDate ? form.endDate : null,
                endAfterOccurrences:
                  form.endMode === 'count' && form.endAfterOccurrences
                    ? Number.parseInt(form.endAfterOccurrences, 10)
                    : null,
                rule: form.rule,
              }}
            />
          </>
        ) : null}
      </section>

      <div className="wizard-actions">
        <button
          type="button"
          className="button"
          onClick={() => goTo(step - 1)}
          disabled={step === 1}
          data-testid="wizard-back-button"
        >
          Back
        </button>

        {step < 4 ? (
          <button
            type="button"
            className="button button-primary"
            onClick={() => goTo(step + 1)}
            data-testid="wizard-next-button"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            className="button button-primary"
            onClick={() => submit.mutate()}
            disabled={submit.isPending}
            data-testid="wizard-submit-button"
          >
            {mode === 'create' ? 'Create alarm' : 'Save changes'}
          </button>
        )}

        {mode === 'create' ? (
          <button
            type="button"
            className="button button-danger"
            onClick={() => {
              discardDraft.mutate();
              void navigate(`/folders/${form.folderId}`);
            }}
            data-testid="wizard-discard-button"
          >
            Discard draft
          </button>
        ) : null}
      </div>
    </main>
  );
}

function RepetitionStep({
  form,
  update,
  error,
}: {
  form: WizardForm;
  update: (patch: Partial<WizardForm>) => void;
  error?: ApiError;
}) {
  const rule = form.rule;

  function setType(type: Rule['type']) {
    switch (type) {
      case 'weekly':
        update({ rule: { type: 'weekly', byWeekday: ['MO'] } });
        return;
      case 'monthly_day':
        update({ rule: { type: 'monthly_day', dayOfMonth: 1 } });
        return;
      case 'monthly_nth':
        update({ rule: { type: 'monthly_nth', nth: 1, weekday: 'MO' } });
        return;
      case 'interval':
        update({ rule: { type: 'interval', every: 1, unit: 'days' } });
        return;
      default:
        update({ rule: { type } as Rule });
    }
  }

  return (
    <>
      <div className="field">
        <label htmlFor="alarm-rule-type">Repeats</label>
        <select
          id="alarm-rule-type"
          value={rule.type}
          onChange={(event) => setType(event.target.value as Rule['type'])}
          data-testid="alarm-rule-type-select"
        >
          <option value="once">Once</option>
          <option value="daily">Every day</option>
          <option value="weekly">Weekly</option>
          <option value="monthly_day">Monthly, on a day of the month</option>
          <option value="monthly_nth">Monthly, on the nth weekday</option>
          <option value="interval">Every N days, weeks or months</option>
        </select>
      </div>

      {rule.type === 'weekly' ? (
        <fieldset className="fieldset" data-testid="alarm-weekday-fieldset">
          <legend>Weekdays</legend>
          {/* R-03: at least one is required; duplicates are impossible here. */}
          {WEEKDAYS.map((day) => (
            <label key={day} className="radio-row">
              <input
                type="checkbox"
                checked={rule.byWeekday.includes(day)}
                onChange={(event) =>
                  update({
                    rule: {
                      type: 'weekly',
                      byWeekday: event.target.checked
                        ? [...rule.byWeekday, day]
                        : rule.byWeekday.filter((existing) => existing !== day),
                    },
                  })
                }
                data-testid={`alarm-weekday-${day.toLowerCase()}-checkbox`}
              />
              {day}
            </label>
          ))}
          {error?.fieldError('rule.byWeekday') ? (
            <p className="field-error" data-testid="alarm-weekday-error">
              {error.fieldError('rule.byWeekday')}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {rule.type === 'monthly_day' ? (
        <div className="field">
          <label htmlFor="alarm-day-of-month">Day of the month</label>
          <input
            id="alarm-day-of-month"
            type="number"
            min={1}
            max={31}
            value={rule.dayOfMonth}
            onChange={(event) =>
              update({
                rule: { type: 'monthly_day', dayOfMonth: Number.parseInt(event.target.value, 10) || 1 },
              })
            }
            data-testid="alarm-day-of-month-input"
          />
          {/* R-04, stated where the user chooses the day rather than after they submit. */}
          {rule.dayOfMonth > 28 ? (
            <p className="field-hint" data-testid="alarm-day-of-month-hint">
              Months shorter than {rule.dayOfMonth} days are skipped, not moved to the last day.
            </p>
          ) : null}
        </div>
      ) : null}

      {rule.type === 'monthly_nth' ? (
        <>
          <div className="field">
            <label htmlFor="alarm-nth">Which one</label>
            <select
              id="alarm-nth"
              value={rule.nth}
              onChange={(event) =>
                update({
                  rule: {
                    type: 'monthly_nth',
                    nth: Number.parseInt(event.target.value, 10) as 1 | 2 | 3 | 4 | -1,
                    weekday: rule.weekday,
                  },
                })
              }
              data-testid="alarm-nth-select"
            >
              <option value={1}>First</option>
              <option value={2}>Second</option>
              <option value={3}>Third</option>
              <option value={4}>Fourth</option>
              <option value={-1}>Last</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="alarm-nth-weekday">Weekday</label>
            <select
              id="alarm-nth-weekday"
              value={rule.weekday}
              onChange={(event) =>
                update({
                  rule: { type: 'monthly_nth', nth: rule.nth, weekday: event.target.value as Weekday },
                })
              }
              data-testid="alarm-nth-weekday-select"
            >
              {WEEKDAYS.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}

      {rule.type === 'interval' ? (
        <>
          <div className="field">
            <label htmlFor="alarm-interval-every">Every</label>
            <input
              id="alarm-interval-every"
              type="number"
              min={1}
              max={365}
              value={rule.every}
              onChange={(event) =>
                update({
                  rule: {
                    type: 'interval',
                    every: Number.parseInt(event.target.value, 10) || 1,
                    unit: rule.unit,
                  },
                })
              }
              aria-describedby={error?.fieldError('rule.every') ? 'alarm-interval-error' : undefined}
              data-testid="alarm-interval-every-input"
            />
            {error?.fieldError('rule.every') ? (
              <p id="alarm-interval-error" className="field-error" data-testid="alarm-interval-error">
                {error.fieldError('rule.every')}
              </p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="alarm-interval-unit">Unit</label>
            <select
              id="alarm-interval-unit"
              value={rule.unit}
              onChange={(event) =>
                update({
                  rule: {
                    type: 'interval',
                    every: rule.every,
                    unit: event.target.value as 'days' | 'weeks' | 'months',
                  },
                })
              }
              data-testid="alarm-interval-unit-select"
            >
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
              <option value="months">Months</option>
            </select>
          </div>
        </>
      ) : null}
    </>
  );
}
