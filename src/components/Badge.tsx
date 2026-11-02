import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { palette } from '@/theme/colors';
import { ClassificationStatus, BlockStatus } from '@/types';

interface BadgeProps {
  label: string;
  variant?: 'success' | 'danger' | 'warning' | 'info' | 'neutral';
}

export function Badge({ label, variant = 'neutral' }: BadgeProps) {
  const getColors = () => {
    switch (variant) {
      case 'success':
        return { bg: palette.greenLight, text: palette.green };
      case 'danger':
        return { bg: palette.redLight, text: palette.red };
      case 'warning':
        return { bg: '#FEF3C7', text: '#B45309' };
      case 'info':
        return { bg: '#E0F2FE', text: '#0369A1' };
      case 'neutral':
      default:
        return { bg: palette.grayLight, text: palette.grayDark };
    }
  };

  const colors = getColors();

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

export function ClassificationBadge({ status }: { status: ClassificationStatus }) {
  switch (status) {
    case 'AUTHORIZED':
      return <Badge label="Autorizado" variant="success" />;
    case 'UNAUTHORIZED_CONFIRMED':
      return <Badge label="Na Lista de Bloqueio" variant="danger" />;
    case 'PENDING_REVIEW':
      return <Badge label="Em Análise" variant="warning" />;
    case 'USER_ADDED':
      return <Badge label="Adicionado pelo Usuário" variant="info" />;
    case 'EXCEPTION':
      return <Badge label="Exceção Manual" variant="success" />;
    default:
      return <Badge label={status} variant="neutral" />;
  }
}

export function BlockStatusBadge({ status }: { status: BlockStatus }) {
  if (status === 'BLOCK') {
    return <Badge label="Bloqueado" variant="danger" />;
  }
  return <Badge label="Liberado" variant="success" />;
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
