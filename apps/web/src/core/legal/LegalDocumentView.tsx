/** @status Active */

import { Link } from "react-router-dom";
import { messages } from "@shared/i18n/uk";
import { MeshBackground } from "@shared/components/layout/MeshBackground";
import { BrandLogo } from "../app/BrandLogo";
import { PRICING_PATH, SIGN_IN_PATH } from "../app/appPaths";
import { LegalLinks } from "./LegalLinks";
import type { LegalDocument } from "./legalDocumentTypes";

interface LegalDocumentViewProps {
  readonly document: LegalDocument;
  readonly lastUpdated: string;
}

export function LegalDocumentView({
  document,
  lastUpdated,
}: LegalDocumentViewProps) {
  return (
    <MeshBackground
      className="h-app-dvh min-h-0 overflow-y-auto overscroll-contain px-5 py-8 sm:py-12"
      data-testid="legal-scroll-container"
    >
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-4xl flex-col gap-8 outline-none"
      >
        <header className="text-center space-y-5">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center justify-center rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
            aria-label={messages.legal.homeLogoAria}
          >
            <BrandLogo size="lg" />
          </Link>
          <div className="space-y-3">
            <p className="text-style-overline text-brand-strong">
              {document.eyebrow}
            </p>
            <h1 className="text-style-display text-text">{document.title}</h1>
            <p className="mx-auto max-w-2xl text-style-body text-muted">
              {document.intro}
            </p>
          </div>
          <div className="rounded-3xl border border-warning-soft bg-warning-soft/40 p-4 text-left text-style-body-sm text-text">
            <strong>Founder/lawyer review gate:</strong>{" "}
            {messages.legal.reviewGateNotice}
          </div>
          <p className="text-style-caption text-subtle">
            {messages.legal.lastUpdatedPrefix} {lastUpdated}
          </p>
        </header>

        <article className="space-y-4">
          {document.sections.map((section) => (
            <section
              key={section.title}
              className="rounded-3xl border border-line bg-panel p-5 sm:p-6"
            >
              <h2 className="text-style-headline text-text">{section.title}</h2>
              <div className="mt-3 space-y-3 text-style-body-sm text-muted">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </article>

        <footer className="space-y-4 text-center">
          <LegalLinks />
          <div className="flex flex-wrap items-center justify-center gap-3 text-style-body-sm">
            <Link
              to={PRICING_PATH}
              className="inline-flex min-h-11 items-center px-1 text-brand-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline"
            >
              {messages.legal.goToPricing}
            </Link>
            <span className="text-subtle" aria-hidden="true">
              {"\u00b7"}
            </span>
            <Link
              to={SIGN_IN_PATH}
              className="inline-flex min-h-11 items-center px-1 text-brand-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline"
            >
              {messages.legal.signInOrCreate}
            </Link>
          </div>
        </footer>
      </main>
    </MeshBackground>
  );
}
