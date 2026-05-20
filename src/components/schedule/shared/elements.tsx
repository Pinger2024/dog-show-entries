import { View, Text } from '@react-pdf/renderer';
import React from 'react';
import { s, CSv } from './styles';

/**
 * Small reusable rendering primitives shared by both the single-breed and
 * multi-breed schedule renderers. Pure and stateless — style refs the
 * shared StyleSheet so visual identity stays in lockstep.
 *
 * Each primitive accepts an optional `variant` prop: 'rkc' (default) uses
 * Remi green + gold, 'sv' uses the BRG red + blue + orange palette so
 * SV regional shows visually differentiate themselves (Amanda 2026-05-20).
 */

type Variant = 'rkc' | 'sv';

export function SectionBand({ title, variant = 'rkc' }: { title: string; variant?: Variant }) {
  return (
    <View style={[s.sectionBand, variant === 'sv' && { backgroundColor: CSv.primary }]}>
      <Text style={s.sectionBandText}>{title}</Text>
    </View>
  );
}

export function InfoCard({
  title,
  children,
  variant = 'rkc',
}: {
  title?: string;
  children: React.ReactNode;
  variant?: Variant;
}) {
  return (
    <View
      style={[s.infoCard, variant === 'sv' && { borderLeftColor: CSv.primary }]}
      wrap={false}
    >
      {title && (
        <Text style={[s.infoCardTitle, variant === 'sv' && { color: CSv.primary }]}>{title}</Text>
      )}
      {children}
    </View>
  );
}

export function GoldRule({ variant = 'rkc' }: { variant?: Variant } = {}) {
  return (
    <View style={[s.coverGoldRule, variant === 'sv' && { backgroundColor: CSv.streak }]} />
  );
}

export function Rule({ num, children }: { num: string; children: React.ReactNode }) {
  return (
    <Text style={s.ruleText}>
      <Text style={s.ruleNumber}>{num}.</Text> {children}
    </Text>
  );
}
