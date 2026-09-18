import {
  LEGAL_COOKIES_PATH,
  LEGAL_OFFER_PATH,
  LEGAL_PRIVACY_PATH,
  LEGAL_TERMS_PATH,
} from "../app/appPaths";
import { cookiesDocument } from "./cookiesDocument";
import { LegalDocumentView } from "./LegalDocumentView";
import type { LegalDocument } from "./legalDocumentTypes";
import { LAST_UPDATED } from "./legalShared";
import { offerDocument } from "./offerDocument";
import { privacyDocument } from "./privacyDocument";
import { termsDocument } from "./termsDocument";

type LegalPath =
  | typeof LEGAL_PRIVACY_PATH
  | typeof LEGAL_TERMS_PATH
  | typeof LEGAL_COOKIES_PATH
  | typeof LEGAL_OFFER_PATH;

interface LegalPageProps {
  readonly pathname: string;
}

const documents: Record<LegalPath, LegalDocument> = {
  [LEGAL_PRIVACY_PATH]: privacyDocument,
  [LEGAL_TERMS_PATH]: termsDocument,
  [LEGAL_COOKIES_PATH]: cookiesDocument,
  [LEGAL_OFFER_PATH]: offerDocument,
};

function isLegalPath(pathname: string): pathname is LegalPath {
  return (
    pathname === LEGAL_PRIVACY_PATH ||
    pathname === LEGAL_TERMS_PATH ||
    pathname === LEGAL_COOKIES_PATH ||
    pathname === LEGAL_OFFER_PATH
  );
}

export function LegalPage({ pathname }: LegalPageProps) {
  const document =
    documents[isLegalPath(pathname) ? pathname : LEGAL_PRIVACY_PATH];

  return <LegalDocumentView document={document} lastUpdated={LAST_UPDATED} />;
}

export default LegalPage;
