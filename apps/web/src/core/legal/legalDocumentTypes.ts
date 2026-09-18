/** @status Active */

export interface LegalSection {
  readonly title: string;
  readonly body: ReadonlyArray<string>;
}

export interface LegalDocument {
  readonly eyebrow: string;
  readonly title: string;
  readonly intro: string;
  readonly sections: ReadonlyArray<LegalSection>;
}
