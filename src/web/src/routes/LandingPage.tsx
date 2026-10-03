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

      <section className="panel panel-white landing-detail" data-testid="landing-detail">
        <div className="landing-detail-copy">
          <h2 className="landing-detail-title">It works out when each one lands</h2>
          <p>
            Daily, weekly, weekdays only, every third Tuesday. Nudge does the
            arithmetic, warns you when two alarms collide, and keeps the rest to
            itself.
          </p>
        </div>

        <ul className="landing-samples">
          <li>
            <span className="landing-dot landing-dot-blue" />
            Weekdays · 07:30 · Morning run
          </li>
          <li>
            <span className="landing-dot landing-dot-coral" />
            Every 90 minutes · Stand up
          </li>
          <li>
            <span className="landing-dot landing-dot-green" />
            Sundays · 19:00 · Plan the week
          </li>
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
