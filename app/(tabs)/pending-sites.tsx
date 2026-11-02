import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Clock, Check, X, Pause, AlertCircle } from 'lucide-react-native';
import { palette } from '@/theme/colors';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { useDomainsStore } from '@/features/domains/domains.store';
import { BlockedDomain, ReviewStatus } from '@/types';

export default function PendingSitesScreen() {
  const { pendingDomains, isLoading, loadPendingDomains, reviewDomain } = useDomainsStore();

  const [selectedDomain, setSelectedDomain] = useState<BlockedDomain | null>(null);
  const [reviewAction, setReviewAction] = useState<ReviewStatus | null>(null);
  const [reviewerNote, setReviewerNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadPendingDomains();
  }, [loadPendingDomains]);

  const openReviewModal = (domain: BlockedDomain, status: ReviewStatus) => {
    setSelectedDomain(domain);
    setReviewAction(status);
    setReviewerNote('');
  };

  const handleConfirmReview = async () => {
    if (!selectedDomain || !reviewAction) return;

    if (!reviewerNote.trim()) {
      Alert.alert('Justificativa Obrigatória', 'Informe uma nota de auditoria para a decisão.');
      return;
    }

    setIsSubmitting(true);
    const success = await reviewDomain(selectedDomain.id, reviewAction, reviewerNote.trim());
    setIsSubmitting(false);

    if (success) {
      Alert.alert('Decisão Registrada', 'A classificação do domínio foi atualizada no banco local.');
      setSelectedDomain(null);
      setReviewAction(null);
      setReviewerNote('');
    } else {
      Alert.alert('Erro', useDomainsStore.getState().error || 'Não foi possível registrar a revisão.');
    }
  };

  const renderPendingItem = ({ item }: { item: BlockedDomain }) => (
    <Card style={styles.pendingCard}>
      <View style={styles.headerRow}>
        <Text style={styles.domainName} numberOfLines={1}>
          {item.domain}
        </Text>
        <Badge label="Aguardando Análise" variant="warning" />
      </View>

      <Text style={styles.evidenceText}>{item.evidence}</Text>

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>Verificado: {item.verified_at}</Text>
        <Text style={styles.metaText}>Categoria: {item.category}</Text>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.btnApprove]}
          onPress={() => openReviewModal(item, 'APPROVED')}
        >
          <Check size={14} color={palette.white} />
          <Text style={styles.actionBtnText}>Confirmar Bloqueio</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.btnReject]}
          onPress={() => openReviewModal(item, 'REJECTED')}
        >
          <X size={14} color={palette.white} />
          <Text style={styles.actionBtnText}>Liberar (Legítimo)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.btnSuspend]}
          onPress={() => openReviewModal(item, 'SUSPENDED')}
        >
          <Pause size={14} color={palette.white} />
          <Text style={styles.actionBtnText}>Suspender</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );

  return (
    <View style={styles.container}>
      <View style={styles.infoBanner}>
        <AlertCircle size={18} color={palette.teal} />
        <Text style={styles.infoBannerText}>
          Domínios nesta fila aguardam sua análise e só passam a ser bloqueados depois de confirmados.
        </Text>
      </View>

      <FlatList
        data={pendingDomains}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderPendingItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              icon={Clock}
              title="Nenhuma pendência na fila"
              description="Todos os domínios registrados foram devidamente classificados e analisados."
            />
          ) : undefined
        }
      />

      {/* MODAL DE JUSTIFICATIVA DA REVISÃO */}
      <Modal
        visible={selectedDomain !== null && reviewAction !== null}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setSelectedDomain(null);
          setReviewAction(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Revisão do Domínio</Text>
              <TouchableOpacity
                onPress={() => {
                  setSelectedDomain(null);
                  setReviewAction(null);
                }}
              >
                <X size={22} color={palette.navy} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.domainHighlight}>{selectedDomain?.domain}</Text>

              <Text style={styles.decisionPrompt}>
                Ação selecionada:{' '}
                <Text style={styles.decisionBold}>
                  {reviewAction === 'APPROVED'
                    ? 'Bloquear este domínio'
                    : reviewAction === 'REJECTED'
                    ? 'Liberar este domínio'
                    : 'Suspender (Manter em análise adicional)'}
                </Text>
              </Text>

              <Text style={styles.inputLabel}>Nota do Revisor (Obrigatória para auditoria):</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Insira a fundamentação ou fonte consultada..."
                value={reviewerNote}
                onChangeText={setReviewerNote}
                multiline
                numberOfLines={4}
              />

              <TouchableOpacity
                style={[styles.confirmButton, isSubmitting && styles.buttonDisabled]}
                onPress={handleConfirmReview}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={palette.white} />
                ) : (
                  <Text style={styles.confirmButtonText}>Confirmar e Salvar Decisão</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.backgroundLight,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
    gap: 8,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#0369A1',
    lineHeight: 18,
  },
  listContent: {
    padding: 16,
  },
  pendingCard: {
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  domainName: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.navy,
    flex: 1,
    marginRight: 8,
  },
  evidenceText: {
    fontSize: 13,
    color: palette.grayDark,
    backgroundColor: palette.backgroundLight,
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  metaText: {
    fontSize: 12,
    color: palette.gray,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 6,
    gap: 4,
  },
  btnApprove: {
    backgroundColor: palette.red,
  },
  btnReject: {
    backgroundColor: palette.green,
  },
  btnSuspend: {
    backgroundColor: palette.gray,
  },
  actionBtnText: {
    color: palette.white,
    fontSize: 11,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: palette.white,
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderLight,
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.navy,
  },
  modalBody: {
    gap: 12,
  },
  domainHighlight: {
    fontSize: 18,
    fontWeight: '800',
    color: palette.navy,
  },
  decisionPrompt: {
    fontSize: 13,
    color: palette.grayDark,
  },
  decisionBold: {
    fontWeight: '700',
    color: palette.navy,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.navy,
  },
  textInput: {
    backgroundColor: palette.backgroundLight,
    borderWidth: 1,
    borderColor: palette.borderLight,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    height: 80,
    textAlignVertical: 'top',
  },
  confirmButton: {
    backgroundColor: palette.navy,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  confirmButtonText: {
    color: palette.white,
    fontWeight: '700',
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
