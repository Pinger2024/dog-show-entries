/**
 * pdf-kit — shared PDF layout building blocks so pages adapt to their
 * content instead of being hand-tuned. See ./README.md for what each piece
 * is for and when to reach for it.
 */
export {
  registerPdfKitFonts,
  registerHankenGrotesk,
  assertFontBudget,
  PDF_KIT_FAMILIES,
  type PdfKitFamily,
  type PdfKitAnyFamily,
} from './fonts';

export {
  measureTextWidth,
  estimateLineCount,
  estimateTextHeight,
  fitFontSize,
  type FontWeight,
  type FontStyle,
  type FontSpec,
  type LineWrapSpec,
  type FitFontSizeOptions,
} from './measure';

export {
  PageFrame,
  Folio,
  type PageFrameProps,
  type PageFrameMargins,
  type FolioProps,
  type FolioFormat,
  type NoBorderStyle,
} from './page-frame';

export {
  SectionTitle,
  DEFAULT_SECTION_TITLE_MIN_PRESENCE_AHEAD,
  type SectionTitleProps,
  type SectionTitleVariant,
} from './section-title';

export { KeepTogether, type KeepTogetherProps } from './keep-together';

export { FitText, type FitTextProps } from './fit-text';

export {
  BalancedColumns,
  balanceColumns,
  type BalancedColumnsProps,
  type BalancedColumnsItem,
  type HeightedItem,
} from './balanced-columns';

export {
  Flow,
  DEFAULT_FLOW_KEEP_WITH_HEADING,
  type FlowProps,
  type FlowBlock,
} from './flow';

export {
  renderWithPageBudget,
  pdfPageCount,
  type RenderWithPageBudgetOptions,
} from './render-with-page-budget';
