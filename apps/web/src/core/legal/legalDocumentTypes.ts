/** @status Active */

export interface LegalSection {
  readonly title: string;
  readonly body: ReadonlyArray<string>;
}

export interface LegalDocument {
  readonly eyebrow: string;
  readonly title: string;
  readonly intro: string;
  /**
   * Дата останньої правки ТЕКСТУ саме цього документа («Останнє оновлення:
   * …»). Своя в кожного: документи міняються незалежно, і спільна дата
   * показувала б оновлення там, де текст не змінювався (рішення власника
   * 2026-10-01). Дата набрання чинності — окремо, `EFFECTIVE_DATE`.
   */
  readonly lastUpdated: string;
  readonly sections: ReadonlyArray<LegalSection>;
}
