import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Logo } from '../components/Logo';
import {
  EverywhereArt,
  HeroArt,
  SpeechArt,
  SwitchingArt,
} from '../components/Illustrations';

const REPO_URL = 'https://github.com/TestNinja007/alarm-configurator';

/**
 * The range, drawn as a line rather than described in a paragraph.
 *
 * This is the one claim a visitor can check at a glance: interval timers own
 * the left end and know nothing about next week, calendars own the right end
 * and cannot count in seconds. Covering both is the whole argument.
 */
const SCALE = [
  { interval: '30 seconds', example: 'Squats — 30 on, 10 off' },
  { interval: '2 minutes', example: 'A cue inside a meditation' },
  { interval: '25 minutes', example: 'Pomodoro, then five off' },
  { interval: '90 minutes', example: 'Stand up and stretch' },
  { interval: 'Daily', example: 'The morning run' },
  { interval: 'Every third Tuesday', example: 'Because some things are' },
];

/** Folders, shown as what they are actually for. */
const PRESETS = [
  { folder: 'Workout', name: 'Legs', detail: '30s on, 10s off, eight rounds' },
  { folder: 'Meditation', name: 'Short', detail: '10 minutes, a cue every two' },
  { folder: 'Work', name: 'Deep', detail: '50 on, 10 off, four rounds' },
  { folder: 'Home', name: 'Sunday', detail: 'Plan the week, 19:00' },
];

/**
 * What a signed-out visitor lands on.
 *
 * Separate from the sign-in form rather than bolted on top of it: a form wants
 * to be the only thing on the screen, and a page explaining the product wants
 * room. Keeping them apart also means the sign-in page stays the small, fast
 * target that a returning user actually wants.
 */
export function LandingPage() {
  // The API refuses to register anyone when REGISTRATION_OPEN is off, so the
  // call to action has to ask first. Sending someone to a sign-up form that
  // answers 404 is worse than not offering one.
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<{ registrationOpen: boolean }>('/health'),
  });
  const canRegister = health.data?.registrationOpen ?? false;

  return (
    <main className="landing" data-testid="landing-page">
      <p className="landing-beta" data-testid="landing-beta">
        <span className="landing-beta-tag">Beta</span>
        Nudge is early and still changing. It is open source — the whole thing is{' '}
        <a href={REPO_URL} target="_blank" rel="noreferrer" data-testid="landing-repo-link">
          on GitHub
        </a>
        .
      </p>

      <nav className="landing-nav" data-testid="landing-nav">
        <span className="auth-lockup">
          <Logo size={30} />
          <span className="landing-wordmark">Nudge</span>
        </span>
        <span className="landing-nav-signin">
          <span className="landing-nav-prompt">Already part of the journey?</span>
          <Link className="button landing-button-ghost" to="/login" data-testid="landing-nav-login-link">
            Sign in!
          </Link>
        </span>
      </nav>

      <section className="landing-hero panel panel-blue">
        <div className="landing-copy">
          <p className="landing-eyebrow">Recurring alarms that speak</p>
          <h1 className="landing-headline">Your day already has a shape.</h1>

          <p className="landing-lead" data-testid="landing-lead">
            Nudge helps you hold it. Set the things you mean to do, and it tells
            you — out loud — when it is time to move to the next one.
          </p>

          <div className="landing-cta">
            {canRegister ? (
              <Link
                className="button button-primary landing-button-join"
                to="/register"
                data-testid="landing-register-link"
              >
                Join Us Today!!
              </Link>
            ) : (
              <Link
                className="button button-primary landing-button-join"
                to="/login"
                data-testid="landing-login-link"
              >
                Sign in!
              </Link>
            )}
          </div>

          {canRegister ? (
            <p className="landing-cta-note" data-testid="landing-cta-note">
              …and we&rsquo;ll nudge you in the right direction.
            </p>
          ) : (
            <p className="landing-cta-note" data-testid="landing-registration-closed">
              Sign-ups are closed on this instance.
            </p>
          )}
        </div>

        <div className="landing-art">
          <HeroArt />
        </div>
      </section>

      <section className="landing-section" data-testid="landing-about">
        <h2 className="landing-section-title">It started with one stubborn problem</h2>

        <p className="landing-prose">
          Alternating between unlike activities in a single day — a block of
          work, then a block of training, then back again. The switch is the
          part everyone is worst at. Easy to postpone, easier to forget
          entirely.
        </p>

        <div className="landing-cards">
          <article className="panel panel-blue landing-card">
            <SwitchingArt />
            <h3 className="landing-card-title">Built for switching</h3>
            <p>
              Work and exercise, study and rest, without either one quietly
              swallowing the whole day.
            </p>
          </article>

          <article className="panel panel-peach landing-card">
            <SpeechArt />
            <h3 className="landing-card-title">A nudge, not a siren</h3>
            <p>
              Alarms speak. Give one several messages and each repeat says a
              different one, so it stays something you hear.
            </p>
          </article>

          <article className="panel panel-mint landing-card">
            <EverywhereArt />
            <h3 className="landing-card-title">Every part of the day</h3>
            <p>
              Home, study, meals, training, winding down. Anything worth doing
              on a schedule.
            </p>
          </article>
        </div>
      </section>

      <section className="landing-section" data-testid="landing-difference">
        <h2 className="landing-section-title">Not a planner</h2>

        <p className="landing-prose">
          There are a thousand apps for laying a day out in advance. If that is
          how you work, use one of those — they are good at it.
        </p>

        <div className="landing-contrast">
          <article className="panel panel-peach landing-contrast-card">
            <h3 className="landing-card-title">If you plan to the minute</h3>
            <p>
              Meditation at 14:00. Workout at 18:30. The day decided the night
              before, and followed.
            </p>
            <p className="landing-contrast-verdict">Nudge is not for you.</p>
          </article>

          <article className="panel panel-mint landing-contrast-card">
            <h3 className="landing-card-title">If you decide in the moment</h3>
            <p>
              &ldquo;I want to train today, at some point.&rdquo; Then a gap
              appears — and what you need is the structure ready to go, not a
              form to fill in first.
            </p>
            <p className="landing-contrast-verdict">This is the whole idea.</p>
          </article>
        </div>

        <p className="landing-prose landing-prose-close">
          Nudge does not help you plan your day. It helps you make the most of a
          plan you already had in mind.
        </p>
      </section>

      <section className="landing-section" data-testid="landing-scale-section">
        <h2 className="landing-section-title">
          Thirty seconds, or every third Tuesday
        </h2>

        <p className="landing-prose">
          Interval timers are good at seconds and know nothing about next week.
          Calendars are good at weeks and cannot count in seconds. Nudge covers
          the whole range, with one way of thinking about it — and tells you
          when two of them want the same minute.
        </p>

        <ol className="landing-scale" data-testid="landing-scale">
          {SCALE.map((stop) => (
            <li key={stop.interval}>
              <span className="landing-scale-mark" aria-hidden="true" />
              <span className="landing-scale-interval">{stop.interval}</span>
              <span className="landing-scale-example">{stop.example}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel panel-white landing-detail" data-testid="landing-presets">
        <div className="landing-detail-copy">
          <h2 className="landing-detail-title">Build it once. Keep it.</h2>
          <p>
            The reason people delete alarms is that an uncategorised list stops
            being usable — so the work goes in the bin, and next time you build
            the same thing again from scratch.
          </p>
          <p>
            Folders make an alarm a preset. When the moment arrives, open the
            folder. It is already there.
          </p>
        </div>

        <ul className="landing-presets">
          {PRESETS.map((preset) => (
            <li key={`${preset.folder}/${preset.name}`}>
              <span className="landing-preset-folder">{preset.folder}</span>
              <span className="landing-preset-name">{preset.name}</span>
              <span className="landing-preset-detail">{preset.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="landing-footer">
        <span className="auth-lockup">
          <Logo size={22} />
          <span className="landing-footer-wordmark">Nudge</span>
        </span>
        <p className="landing-footer-note">
          {canRegister ? (
            <>
              <Link to="/register" data-testid="landing-footer-register-link">
                Create an account
              </Link>
              {' · '}
            </>
          ) : null}
          <Link to="/login" data-testid="landing-footer-login-link">
            Sign in
          </Link>
          {' · '}
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            Source
          </a>
        </p>
      </footer>
    </main>
  );
}
