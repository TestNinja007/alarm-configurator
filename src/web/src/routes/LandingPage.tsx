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
 * Deliberately stops at hours. Daily and weekly were on here and were cut:
 * every reminder app on earth does daily, so putting it on the scale spends a
 * stop proving something nobody doubts and dilutes the part that is actually
 * uncommon. Seconds to hours is the band being claimed.
 */
const SCALE = [
  {
    interval: '30 seconds',
    example:
      'Squats — thirty on, ten off, eight rounds. The voice counts you through it, so you never look at the screen.',
  },
  {
    interval: '2 minutes',
    example:
      'A cue inside a ten-minute meditation. You know where you are in it without opening your eyes.',
  },
  {
    interval: '25 minutes',
    example:
      'Pomodoro, then five off, four times over — and a different sentence each time it comes back.',
  },
  {
    interval: '90 minutes',
    example:
      'Stand up and stretch, from the first hour of the working day to the last, whether or not you meant to.',
  },
];

/**
 * Folders, shown as what they are actually for: three presets each, because
 * one apiece demonstrated nothing a reader could not already assume.
 *
 * These are the shape the product is really used in — things you know you will
 * do today without knowing when, started the moment the gap appears.
 */
const FOLDERS = [
  {
    name: 'Work',
    presets: [
      { name: 'Stretch', detail: 'Stand up every 50 minutes, for two' },
      { name: 'Lunch walk', detail: '20 minutes, straight after eating' },
      { name: 'Reset', detail: 'Box breathing — 4 in, 4 hold, 4 out, 4 hold' },
    ],
  },
  {
    name: 'Unwind',
    presets: [
      { name: '4-7-8 breath', detail: '4 in, 7 hold, 8 out, eight rounds' },
      { name: 'Body scan', detail: '10 minutes, a cue every two' },
      { name: 'Progressive relaxation', detail: '20s tense, 20s release, head to feet' },
    ],
  },
  {
    name: 'Workout',
    presets: [
      { name: 'Legs', detail: '30s on, 10s off, eight rounds' },
      { name: 'Quick HIIT', detail: '20s on, 10s off, eight rounds' },
      { name: 'Cool down', detail: '60s a stretch, five of them' },
    ],
  },
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
          <p className="landing-eyebrow">Plan your day out loud</p>
          <h1 className="landing-headline">
            Whatever vague idea pops into your head.
          </h1>

          <p className="landing-lead" data-testid="landing-lead">
            Nudge helps you shape it, and hold on to it. Set the structure in
            seconds — it tells you out loud when to move.
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
          Nudge does not help you plan your day. It helps you make the most of
          an idea that pops into your head.
        </p>
      </section>

      <section className="landing-section" data-testid="landing-scale-section">
        <h2 className="landing-section-title">Thirty seconds. Or ninety minutes.</h2>

        <p className="landing-prose">
          Reminder apps start at a minute and are really built for days, because
          a calendar has no reason to count smaller. Interval timers go down to
          a second and then forget you exist the moment the session ends. The
          band in between is where a body actually lives, and it is the one
          nothing covers properly.
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

        <p className="landing-prose landing-prose-close">
          And it still does weekdays, monthly, and every third Tuesday — it just
          does not stop there.
        </p>
      </section>

      <section className="panel panel-white landing-library" data-testid="landing-presets">
        <h2 className="landing-library-title">Build it once. Keep it.</h2>
        <p>
          The reason people delete alarms is that an uncategorised list stops
          being usable — so the work goes in the bin, and next time you build
          the same thing again from scratch.
        </p>
        <p>
          Folders make an alarm a preset. You know you will stretch, walk and
          breathe at some point today — you just do not know when. When the gap
          appears, open the folder and start the one that fits.
        </p>

        <p className="landing-library-caption">
          Three folders, the way they typically end up:
        </p>

        <div className="landing-folders">
          {FOLDERS.map((folder) => (
            <article className="landing-folder" key={folder.name}>
              <h3 className="landing-folder-name">{folder.name}</h3>
              <ul>
                {folder.presets.map((preset) => (
                  <li key={preset.name}>
                    <span className="landing-preset-name">{preset.name}</span>
                    <span className="landing-preset-detail">{preset.detail}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
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
