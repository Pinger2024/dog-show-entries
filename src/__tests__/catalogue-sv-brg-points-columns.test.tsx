import { describe, it, expect } from 'vitest';
import { SvClassificationPage } from '@/components/catalogue/sv-front-matter';
import type { CatalogueShowInfo } from '@/components/catalogue/catalogue-types';
import { View, Text } from '@react-pdf/renderer';
import { isValidElement, type ReactElement } from 'react';

/**
 * Mandy photographed the printed A5 regional catalogue and flagged the BRG
 * points block (2026-09-07): "wondering we can lay it out slightly clearer
 * to show vv1 = 1 point, SG1 = 2, SG2 = 1, SG1 Adult = 4, SG2 Adult = 2, V1
 * Working = 5, V2 Working = 4 and VA Working = 10" — the old 4-across
 * wrapped grid pushed each value to the cell's far edge, so on the printed
 * page it visually sat next to the NEXT label. This replaces it with three
 * side-by-side columns (Puppy/Youth, Adult, Working), each label directly
 * beside its own points value.
 *
 * `allText` flattens away layout, so — following
 * catalogue-judge-copy-results.test.tsx's pattern — a layout-aware walker
 * is used to prove label and value are siblings in the same row.
 */

function makeShow(): CatalogueShowInfo {
  return {
    name: 'North East Regional',
    showType: 'championship',
    showRuleset: 'wusv',
    date: '2026-09-05',
    venue: 'Test Ground',
    venueAddress: 'Somewhere',
    organisation: 'Test GSD Club',
    kcLicenceNo: '1234',
    allShowClasses: [],
  } as CatalogueShowInfo;
}

interface TextNode {
  kind: 'text';
  value: string;
  style: unknown;
  parent: ViewNode | null;
}
interface ViewNode {
  kind: 'view';
  style: unknown;
  parent: ViewNode | null;
}

function allText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(allText).join('\n');
  if (isValidElement(node)) return allText((node as ReactElement<any>).props.children);
  return '';
}

function walkTree(node: unknown, parent: ViewNode | null, out: TextNode[]): void {
  if (node == null || typeof node === 'boolean') return;
  if (typeof node === 'string' || typeof node === 'number') return;
  if (Array.isArray(node)) {
    for (const child of node) walkTree(child, parent, out);
    return;
  }
  if (!isValidElement(node)) return;
  const el = node as ReactElement<any>;
  if (el.type === Text) {
    out.push({ kind: 'text', value: allText(el.props.children), style: el.props.style, parent });
    return;
  }
  if (el.type === View) {
    const viewNode: ViewNode = { kind: 'view', style: el.props.style, parent };
    walkTree(el.props.children, viewNode, out);
    return;
  }
  walkTree(el.props.children, parent, out);
}

function collectTextNodes(element: unknown): TextNode[] {
  const out: TextNode[] = [];
  walkTree(element, null, out);
  return out;
}

function findText(nodes: TextNode[], value: string): TextNode {
  const found = nodes.find((n) => n.value === value);
  if (!found) throw new Error(`No <Text> leaf with value ${JSON.stringify(value)}`);
  return found;
}

describe('SvClassificationPage — BRG points system, three-column layout', () => {
  const EXPECTED_ROWS: { label: string; value: string }[] = [
    { label: 'VV1 / VP1', value: '1 pt' },
    { label: 'SG1', value: '2 pts' },
    { label: 'SG2', value: '1 pt' },
    { label: 'SG1 adult', value: '4 pts' },
    { label: 'SG2 adult', value: '2 pts' },
    { label: 'V1 working', value: '5 pts' },
    { label: 'V2 working', value: '4 pts' },
    { label: 'VA working', value: '10 pts' },
  ];

  it('renders all three column headings', () => {
    const nodes = collectTextNodes(SvClassificationPage({ show: makeShow() }));
    const headings = nodes.map((n) => n.value);
    expect(headings).toContain('Puppy / Youth');
    expect(headings).toContain('Adult');
    expect(headings).toContain('Working');
  });

  it.each(EXPECTED_ROWS)('label "$label" and its value "$value" are siblings in the same row', ({ label, value }) => {
    // Several values repeat across rows (e.g. "1 pt" for both VV1/VP1 and
    // SG2), so the value can't be located by a global text search — it must
    // be found as the label's OWN row sibling, exactly as
    // catalogue-judge-copy-results.test.tsx locates a grid's filled-in value.
    const nodes = collectTextNodes(SvClassificationPage({ show: makeShow() }));
    const labelNode = findText(nodes, label);
    expect(labelNode.parent).not.toBeNull();
    const sibling = nodes.find((n) => n.parent === labelNode.parent && n !== labelNode);
    expect(sibling).toBeDefined();
    expect(sibling!.value).toBe(value);
    // ...and label precedes value in document order (label then value).
    const labelIndex = nodes.indexOf(labelNode);
    const valueIndex = nodes.indexOf(sibling!);
    expect(labelIndex).toBeLessThan(valueIndex);
  });

  it('every points value renders bold', () => {
    const nodes = collectTextNodes(SvClassificationPage({ show: makeShow() }));
    for (const { label } of EXPECTED_ROWS) {
      const labelNode = findText(nodes, label);
      const valueNode = nodes.find((n) => n.parent === labelNode.parent && n !== labelNode)!;
      const style = valueNode.style as { fontWeight?: string } | { fontWeight?: string }[];
      const styles = Array.isArray(style) ? style : [style];
      expect(styles.some((s) => s?.fontWeight === 'bold')).toBe(true);
    }
  });

  it('the old single wrapped 4-across grid no longer renders — nothing carries a bare unlabelled points digit', () => {
    // The old layout printed the bare value ("1", "2", "4"…) with no unit —
    // that ambiguity, sitting flush at the cell's far edge, is exactly what
    // Mandy flagged. The new layout must never print a bare digit-only leaf
    // for these values; every one carries "pt"/"pts". Scoped to the exact
    // old bare-value strings rather than every digit on the page — the page
    // folio ("03") and class numbers are legitimately bare digits elsewhere.
    const nodes = collectTextNodes(SvClassificationPage({ show: makeShow() }));
    const oldBareValues = new Set(EXPECTED_ROWS.map((r) => String(parseInt(r.value, 10))));
    const bareDigits = nodes.filter((n) => oldBareValues.has(n.value));
    expect(bareDigits).toHaveLength(0);
  });
});
