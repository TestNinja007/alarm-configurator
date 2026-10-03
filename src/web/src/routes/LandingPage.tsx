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
      <nav className="landing-nav" data-testid="landing-nav">
        <span className="auth-lockup">
          <Logo size={30} />
          <span className="landing-wordmark">Nudge</span>
        </span>
        <Link className="button" to="/login" data-testid="landing-nav-login-link">
          Sign in
        </Link>
      </nav>

      <section className="landing-hero">
        <div className="landing-copy">
          <h1 className="landing-headline">Alarms that actually work with you.</h1>

          <p className="landing-lead" data-testid="landing-lead">
            Nudge began with one stubborn problem: alternating between unlike
            activities in the same day. A block of work, then a block of
            training, then back again. The switch is the part everyone is worst
            at — easy to postpone, easier to forget entirely.
          </p>

          <div className="landing-cta">
            {canRegister ? (
              <Link
                className="button button-primary button-large"
                to="/register"
                data-testid="landing-register-link"
              >
                Join us today
              </Link>
            ) : null}
            <Link
              className={canRegister ? 'button button-large' : 'button button-primary button-large'}
              to="/login"
              data-testid="landing-login-link"
            >
              Sign in
            </Link>
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
        <h2 className="landing-section-title">It was never only about training</h2>

        <p className="landing-prose">
          Nudge works anywhere a day has a shape. At home, around meals, while
          studying, with the kids, winding down at the end of it. Anything you
          mean to do at a particular time, repeatedly, and keep not doing.
        </p>

        <div className="landing-cards">
          <article className="card landing-card">
            <SwitchingArt />
            <h3 className="landing-card-title">Built for switching</h3>
            <p>
              Alternate work and exercise, study and rest, without either one
              quietly swallowing the whole day. Group them into folders and run
              them on their own schedules.
            </p>
          </article>

          <article className="card landing-card">
            <SpeechArt />
            <h3 className="landing-card-title">A nudge, not a siren</h3>
            <p>
              Alarms speak. Set several messages and each repeat says a
              different one, so it stays something you hear rather than
              something you learn to sleep through.
            </p>
          </article>

          <article className="card landing-card">
            <EverywhereArt />
            <h3 className="landing-card-title">Every part of the day</h3>
            <p>
              Daily, weekly, every third Tuesday, weekdays only. Nudge works out
              when each one lands, warns you when two collide, and keeps the
              rest to itself.
            </p>
          </article>
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
        </p>
      </footer>
    </main>
  );
}
