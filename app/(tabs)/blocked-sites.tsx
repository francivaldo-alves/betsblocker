import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {
  Search,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Calendar,
  Info,
  X,
  CheckCircle2,
} from 'lucide-react-native';
import { palette } from '@/theme/colors';
import { Card } from '@/components/Card';
import { ClassificationBadge, BlockStatusBadge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { useDomainsStore } from '@/features/domains/domains.store';
import { BlockedDomain } from '@/types';
import { domainService } from '@/services/domain.service';

export default function BlockedSitesScreen() {
  const {
    blockedDomains,
    totalBlocked,
    isLoading,
    searchQuery,
    setSearchQuery,
    loadBlockedDomains,
    addUserDomain,
    addException,
  } = useDomainsStore();

  const [selectedDomain, setSelectedDomain] = useState<BlockedDomain | null>(null);
  const [modalType, setModalType] = useState<'NONE' | 'DETAILS' | 'ADD_DOMAIN' | 'ADD_EXCEPTION'>('NONE');

  // Form states
  const [inputDomain, setInputDomain] = useState('');
  const [inputEvidence, setInputEvidence] = useState('');
  const [inputReason, setInputReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadBlockedDomains();
  }, []);

  const handleAddDomain = async () => {
    if (!inputDomain.trim()) {
      Alert.alert('Validação', 'Informe o domínio.');
      return;
    }
    if (!inputEvidence.trim()) {
      Alert.alert('Validação', 'Informe uma justificativa ou evidência válida.');
      return;
    }

    setIsSubmitting(true);
    const success = await addUserDomain(inputDomain.trim(), inputEvidence.trim());
    setIsSubmitting(false);

    if (success) {
      Alert.alert('Sucesso', 'Domínio cadastrado para bloqueio local.');
      setInputDomain('');
      setInputEvidence('');
      setModalType('NONE');
    } else {
      Alert.alert('Erro', 'Não foi possível cadastrar o domínio. Verifique o formato.');
    }
  };

  const handleAddException = async () => {
    if (!selectedDomain) return;
    if (!inputReason.trim()) {
      Alert.alert('Validação', 'Informe o motivo da liberação manual.');
      return;
    }

    setIsSubmitting(true);
    const success = await addException(selectedDomain.domain, inputReason.trim());
    setIsSubmitting(false);

    if (success) {
      Alert.alert('Exceção Aplicada', `O domínio ${selectedDomain.domain} foi liberado.`);
      setInputReason('');
      setModalType('NONE');
      setSelectedDomain(null);
    } else {
      Alert.alert('Erro', 'Falha ao registrar exceção.');
    }
  };

  const renderDomainItem = ({ item }: { item: BlockedDomain }) => (
    <Card style={styles.domainCard}>
      <TouchableOpacity
        onPress={() => {
          setSelectedDomain(item);
          setModalType('DETAILS');
        }}
        activeOpacity={0.7}
      >
        <View style={styles.domainHeaderRow}>
          <Text style={styles.domainName} numberOfLines={1}>
            {item.domain}
          </Text>
          <BlockStatusBadge status={item.block_status} />
        </View>

        <View style={styles.badgeRow}>
          <ClassificationBadge status={item.classification_status} />
          <Text style={styles.categoryText}>{item.category}</Text>
        </View>

        <Text style={styles.evidenceSnippet} numberOfLines={2}>
          {item.evidence}
        </Text>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Calendar size={13} color={palette.gray} />
            <Text style={styles.metaText}>Verificado: {item.verified_at}</Text>
          </View>
          <Text style={styles.detailsPrompt}>Ver detalhes ›</Text>
        </View>
      </TouchableOpacity>
    </Card>
  );

  return (
    <View style={styles.container}>
      {/* Barra de Pesquisa e Botão Novo */}
      <View style={styles.searchHeader}>
        <View style={styles.searchBox}>
          <Search size={18} color={palette.gray} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por domínio..."
            placeholderTextColor={palette.gray}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={16} color={palette.gray} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            setInputDomain('');
            setInputEvidence('');
            setModalType('ADD_DOMAIN');
          }}
        >
          <Plus size={20} color={palette.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.counterRow}>
        <Text style={styles.counterText}>
          Total de domínios bloqueados: <Text style={styles.counterBold}>{totalBlocked}</Text>
        </Text>
      </View>

      {/* Lista de Domínios */}
      <FlatList
        data={blockedDomains}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderDomainItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              icon={ShieldAlert}
              title="Nenhum domínio bloqueado"
              description={
                searchQuery
                  ? 'Nenhum resultado encontrado para a busca informada.'
                  : 'Nenhum domínio restrito cadastrado no momento. Sincronize as listas no Dashboard.'
              }
            />
          ) : undefined
        }
      />

      {/* MODAL: DETALHES DO REGISTRO */}
      <Modal
        visible={modalType === 'DETAILS' && selectedDomain !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setModalType('NONE')}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Detalhes do Domínio</Text>
              <TouchableOpacity onPress={() => setModalType('NONE')}>
                <X size={22} color={palette.navy} />
              </TouchableOpacity>
            </View>

            {selectedDomain && (
              <View style={styles.modalBody}>
                <Text style={styles.detailDomain}>{selectedDomain.domain}</Text>

                <View style={styles.detailBadges}>
                  <ClassificationBadge status={selectedDomain.classification_status} />
                  <BlockStatusBadge status={selectedDomain.block_status} />
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Categoria:</Text>
                  <Text style={styles.detailValue}>{selectedDomain.category}</Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Evidência Registrada:</Text>
                  <Text style={styles.detailValueEvidence}>{selectedDomain.evidence}</Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Data de Verificação:</Text>
                  <Text style={styles.detailValue}>{selectedDomain.verified_at}</Text>
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.exceptionButton}
                    onPress={() => {
                      setInputReason('');
                      setModalType('ADD_EXCEPTION');
                    }}
                  >
                    <CheckCircle2 size={18} color={palette.white} style={{ marginRight: 6 }} />
                    <Text style={styles.exceptionButtonText}>Liberar Domínio (Exceção)</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL: ADICIONAR DOMÍNIO MANUAL */}
      <Modal
        visible={modalType === 'ADD_DOMAIN'}
        animationType="slide"
        transparent
        onRequestClose={() => setModalType('NONE')}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Adicionar Domínio Manual</Text>
              <TouchableOpacity onPress={() => setModalType('NONE')}>
                <X size={22} color={palette.navy} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Domínio (ex: site.com):</Text>
              <TextInput
                style={styles.inputField}
                placeholder="exemplo.com"
                value={inputDomain}
                onChangeText={setInputDomain}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.inputLabel}>Justificativa / Evidência:</Text>
              <TextInput
                style={[styles.inputField, styles.inputFieldMultiline]}
                placeholder="Motivo da restrição manual..."
                value={inputEvidence}
                onChangeText={setInputEvidence}
                multiline
                numberOfLines={3}
              />

              <TouchableOpacity
                style={[styles.submitButton, isSubmitting && styles.buttonDisabled]}
                onPress={handleAddDomain}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={palette.white} />
                ) : (
                  <Text style={styles.submitButtonText}>Cadastrar Domínio</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: CRIAR EXCEÇÃO MANUAL */}
      <Modal
        visible={modalType === 'ADD_EXCEPTION'}
        animationType="slide"
        transparent
        onRequestClose={() => setModalType('NONE')}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Liberar Domínio</Text>
              <TouchableOpacity onPress={() => setModalType('NONE')}>
                <X size={22} color={palette.navy} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.exceptionPrompt}>
                Deseja permitir o acesso ao domínio <Text style={styles.counterBold}>{selectedDomain?.domain}</Text>?
              </Text>

              <Text style={styles.inputLabel}>Motivo da Liberação Manual:</Text>
              <TextInput
                style={[styles.inputField, styles.inputFieldMultiline]}
                placeholder="Justifique o desbloqueio para auditoria..."
                value={inputReason}
                onChangeText={setInputReason}
                multiline
                numberOfLines={3}
              />

              <TouchableOpacity
                style={[styles.submitButton, isSubmitting && styles.buttonDisabled]}
                onPress={handleAddException}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={palette.white} />
                ) : (
                  <Text style={styles.submitButtonText}>Confirmar Liberação</Text>
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
  searchHeader: {
    flexDirection: 'row',
    padding: 16,
    gap: 10,
    backgroundColor: palette.white,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderLight,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.backgroundLight,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.borderLight,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 14,
    color: palette.navy,
  },
  addButton: {
    width: 44,
    height: 40,
    backgroundColor: palette.teal,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  counterText: {
    fontSize: 13,
    color: palette.gray,
  },
  counterBold: {
    fontWeight: '700',
    color: palette.navy,
  },
  listContent: {
    padding: 16,
    paddingTop: 4,
  },
  domainCard: {
    marginBottom: 10,
  },
  domainHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  domainName: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.navy,
    flex: 1,
    marginRight: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  categoryText: {
    fontSize: 12,
    color: palette.gray,
    backgroundColor: palette.grayLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  evidenceSnippet: {
    fontSize: 13,
    color: palette.grayDark,
    lineHeight: 18,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: palette.borderLight,
    paddingTop: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: palette.gray,
  },
  detailsPrompt: {
    fontSize: 12,
    color: palette.teal,
    fontWeight: '600',
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
    maxHeight: '85%',
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
  detailDomain: {
    fontSize: 18,
    fontWeight: '800',
    color: palette.navy,
  },
  detailBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  detailSection: {
    marginTop: 4,
  },
  detailLabel: {
    fontSize: 12,
    color: palette.gray,
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 14,
    color: palette.navy,
    marginTop: 2,
  },
  detailValueEvidence: {
    fontSize: 14,
    color: palette.grayDark,
    backgroundColor: palette.backgroundLight,
    padding: 10,
    borderRadius: 8,
    marginTop: 4,
    lineHeight: 20,
  },
  modalActions: {
    marginTop: 16,
  },
  exceptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.green,
    paddingVertical: 12,
    borderRadius: 8,
  },
  exceptionButtonText: {
    color: palette.white,
    fontWeight: '700',
    fontSize: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.navy,
    marginTop: 6,
  },
  inputField: {
    backgroundColor: palette.backgroundLight,
    borderWidth: 1,
    borderColor: palette.borderLight,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: palette.navy,
  },
  inputFieldMultiline: {
    height: 70,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: palette.navy,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonText: {
    color: palette.white,
    fontWeight: '700',
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  exceptionPrompt: {
    fontSize: 14,
    color: palette.grayDark,
    lineHeight: 20,
  },
});
