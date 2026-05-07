import { View, Text } from '@react-pdf/renderer';
import React from 'react';
import { s } from './styles';

/**
 * Small reusable rendering primitives shared by both the single-breed and
 * multi-breed schedule renderers. Pure and stateless — style refs the
 * shared StyleSheet so visual identity stays in lockstep.
 */

export function SectionBand({ title }: { title: string }) {
  return (
    <View style={s.sectionBand}>
      <Text style={s.sectionBandText}>{title}</Text>
    </View>
  );
}

export function InfoCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={s.infoCard} wrap={false}>
      {title && <Text style={s.infoCardTitle}>{title}</Text>}
      {children}
    </View>
  );
}

export function GoldRule() {
  return <View style={s.coverGoldRule} />;
}

export function Rule({ num, children }: { num: string; children: React.ReactNode }) {
  return (
    <Text style={s.ruleText}>
      <Text style={s.ruleNumber}>{num}.</Text> {children}
    </Text>
  );
}
