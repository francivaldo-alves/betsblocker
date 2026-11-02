import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  RefreshCw,
  Power,
  AlertCircle,
  FileText,
  Search,
} from 'lucide-react-native';
import { palette } from '@/theme/colors';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { useDomainsStore } from '@/features/domains/domains.store';
import { useProtectionStore } from '@/features/protection/protection.store';
import { useSyncStore } from '@/features/synchronization/sync.store';
import { useHistoryStore } from '@/features/history/history.store';
import { protectionService } from '@/services/protection.service';
import { requestNotificationPermission } from '@/utils/notifications';

export default function DashboardScreen() {
  const { totalBlocked, totalPending, loadBlockedDomains, loadPendingDomains } =
    useDomainsStore();
  const { settings, operationalStatus, toggleProtection } = useProtectionStore();
  const { lastSync, isSyncing, syncError, syncNow } = useSyncStore();
  const { todayBlockedCount } = useHistoryStore();

  const [testDomain, setTestDomain] = useState('');
  const [isTesting, setIsTesting] = useState(false);

  const handleTestDomain = async () => {
    if (!testDomain.trim()) {
      Alert.alert('Insira um Domínio', 'Digite um domínio para testar (ex: blaze.com ou tigrinho.bet).');
      return;
    }
    if (!isProtectionRunning) {
      Alert.alert('Proteção Desativada', 'Ative a proteção no botão acima antes de realizar o teste.');
      return;
    }

    setIsTesting(true);
    try {
      const decision = await protectionService.checkDomain(testDomain);
      if (decision === 'ALLOW') {
        Alert.alert('✅ Domínio Permitido', 'Nenhuma regra ativa bloqueia este domínio.');
      } else {
        const rule = decision === 'GAMBLING' ? 'lista de apostas' : 'lista de anúncios e rastreadores';
        Alert.alert(
          settings.block_mode === 'AUDIT' ? '👁️ Seria Bloqueado' : '🚫 Domínio Bloqueado',
          `O domínio corresponde à ${rule}.`
        );
      }
    } catch (err: any) {
      Alert.alert('Teste Indisponível', err?.message || 'Não foi possível consultar o motor.');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSync = async () => {
    const res = await syncNow();
    if (res.upToDate) {
      Alert.alert('Lista em Dia', `A versão ${res.version} já é a mais recente disponível.`);
    } else if (res.success) {
      await Promise.all([loadBlockedDomains(), loadPendingDomains()]);
      Alert.alert(
        'Sincronização Concluída',
        `Versão ${res.version} aplicada.\n${res.addedRecords} novos, ${res.updatedRecords} atualizados, ${res.removedRecords} removidos.`
      );
    } else {
      Alert.alert('Falha na Sincronização', res.error || 'Erro ao sincronizar listas.');
    }
  };

  const handleToggleProtection = async () => {
    if (!isProtectionRunning && settings.notification_enabled === 1) {
      await requestNotificationPermission();
    }
    const res = await toggleProtection();
    if (res.success) {
      Alert.alert(
        res.active ? 'Proteção Ativada' : 'Proteção Desativada',
        res.active
          ? 'A filtragem de domínios restritos foi habilitada localmente no dispositivo.'
          : 'A proteção local está desativada.'
      );
    } else {
      Alert.alert(
        res.active ? 'Proteção Mantida' : 'Proteção Inoperante',
        res.message || 'Não foi possível alterar a proteção.'
      );
    }
  };

  const isProtectionRunning = operationalStatus === 'RUNNING';
  const isProtectionInterrupted = operationalStatus === 'ERROR';
  const isAuditMode = isProtectionRunning && settings.block_mode === 'AUDIT';
  const protectionSubtitle = isAuditMode
    ? 'Modo auditoria: acessos são registrados, mas nada é bloqueado'
    : isProtectionRunning
      ? 'Proteção local ativa no dispositivo'
      : isProtectionInterrupted
        ? 'A proteção foi interrompida. Você está sem filtro agora'
        : 'Proteção desativada';
  const protectionBadge = isAuditMode
    ? 'AUDITORIA'
    : isProtectionRunning
      ? 'ATIVO'
      : isProtectionInterrupted
        ? 'INTERROMPIDO'
        : 'INATIVO';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Card de Status da Proteção */}
      <Card style={[styles.protectionCard, isProtectionRunning ? styles.cardActive : styles.cardInactive]}>
        <View style={styles.protectionHeader}>
          <View style={styles.protectionIconWrapper}>
            {isProtectionRunning ? (
              <ShieldCheck size={36} color={palette.green} />
            ) : (
              <AlertCircle size={36} color={palette.red} />
            )}
          </View>
          <View style={styles.protectionTextWrapper}>
            <Text style={styles.protectionTitle}>Estado da Proteção</Text>
            <Text style={styles.protectionSubtitle}>
              {protectionSubtitle}
            </Text>
          </View>
          <Badge
            label={protectionBadge}
            variant={isAuditMode ? 'warning' : isProtectionRunning ? 'success' : 'danger'}
          />
        </View>

        <TouchableOpacity
          style={[styles.toggleButton, isProtectionRunning ? styles.btnDanger : styles.btnPrimary]}
          onPress={handleToggleProtection}
        >
          <Power size={18} color={palette.white} style={{ marginRight: 8 }} />
          <Text style={styles.toggleButtonText}>
            {isProtectionRunning
              ? 'Desativar Proteção'
              : isProtectionInterrupted
                ? 'Reativar Proteção'
                : 'Ativar Proteção'}
          </Text>
        </TouchableOpacity>
      </Card>

      {/* Grid de Estatísticas */}
      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <ShieldAlert size={24} color={palette.red} />
          <Text style={styles.statNumber}>{totalBlocked}</Text>
          <Text style={styles.statLabel}>Domínios Bloqueados</Text>
        </Card>

        <Card style={styles.statCard}>
          <Clock size={24} color={palette.teal} />
          <Text style={styles.statNumber}>{totalPending}</Text>
          <Text style={styles.statLabel}>Pendentes de Análise</Text>
        </Card>
      </View>

      {/* Estatísticas de Bloqueio Hoje */}
      <Card>
        <View style={styles.cardHeader}>
          <FileText size={20} color={palette.navy} />
          <Text style={styles.cardTitle}>Sites de Apostas Bloqueados Hoje</Text>
        </View>
        <Text style={styles.statNumberLarge}>{todayBlockedCount}</Text>
        <Text style={styles.helperText}>
          Eventos locais registrados no dispositivo sem envio de telemetria externa.
        </Text>
      </Card>

      {/* Testador de Bloqueio em Tempo Real */}
      <Card>
        <View style={styles.cardHeader}>
          <Search size={20} color={palette.navy} />
          <Text style={styles.cardTitle}>Testar Bloqueio em Tempo Real</Text>
        </View>
        <Text style={styles.helperText}>
          Pergunte ao motor de proteção o que ele faria com um domínio (ex: blaze.com, qualquer.bet). O teste não acessa o site nem entra no histórico.
        </Text>
        <View style={styles.testInputRow}>
          <TextInput
            style={styles.testInput}
            placeholder="Digite o domínio (ex: blaze.com)"
            placeholderTextColor={palette.gray}
            value={testDomain}
            onChangeText={setTestDomain}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.testButton, isTesting && styles.buttonDisabled]}
            onPress={handleTestDomain}
            disabled={isTesting}
          >
            {isTesting ? (
              <ActivityIndicator size="small" color={palette.white} />
            ) : (
              <Text style={styles.testButtonText}>Testar</Text>
            )}
          </TouchableOpacity>
        </View>
      </Card>

      {/* Card de Sincronização e Versão */}
      <Card>
        <View style={styles.cardHeader}>
          <RefreshCw size={20} color={palette.navy} />
          <Text style={styles.cardTitle}>Atualização de Listas Locais</Text>
        </View>

        <View style={styles.syncMetaRow}>
          <Text style={styles.syncMetaLabel}>Última Versão Aplicada:</Text>
          <Text style={styles.syncMetaValue}>
            {lastSync ? `Versão ${lastSync.version}` : 'Preparando lista inicial'}
          </Text>
        </View>

        <View style={styles.syncMetaRow}>
          <Text style={styles.syncMetaLabel}>Data da Atualização:</Text>
          <Text style={styles.syncMetaValue}>
            {lastSync ? new Date(lastSync.synced_at).toLocaleString('pt-BR') : 'Pendente'}
          </Text>
        </View>

        {syncError && (
          <View style={styles.errorBanner}>
            <AlertCircle size={16} color={palette.red} />
            <Text style={styles.errorBannerText}>{syncError}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.syncButton, isSyncing && styles.buttonDisabled]}
          onPress={handleSync}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color={palette.white} />
          ) : (
            <>
              <RefreshCw size={18} color={palette.white} style={{ marginRight: 8 }} />
              <Text style={styles.syncButtonText}>
                Procurar Atualizações
              </Text>
            </>
          )}
        </TouchableOpacity>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.backgroundLight,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  protectionCard: {
    borderLeftWidth: 6,
  },
  cardActive: {
    borderLeftColor: palette.green,
  },
  cardInactive: {
    borderLeftColor: palette.red,
  },
  protectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  protectionIconWrapper: {
    marginRight: 12,
  },
  protectionTextWrapper: {
    flex: 1,
  },
  protectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.navy,
  },
  protectionSubtitle: {
    fontSize: 13,
    color: palette.gray,
    marginTop: 2,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  btnPrimary: {
    backgroundColor: palette.navy,
  },
  btnDanger: {
    backgroundColor: palette.red,
  },
  toggleButtonText: {
    color: palette.white,
    fontWeight: '700',
    fontSize: 14,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 20,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: palette.navy,
    marginTop: 8,
    marginBottom: 4,
  },
  statNumberLarge: {
    fontSize: 36,
    fontWeight: '800',
    color: palette.teal,
    marginVertical: 8,
  },
  statLabel: {
    fontSize: 12,
    color: palette.gray,
    fontWeight: '600',
    textAlign: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.navy,
  },
  syncMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderLight,
  },
  syncMetaLabel: {
    fontSize: 13,
    color: palette.gray,
  },
  syncMetaValue: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.navy,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.teal,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  syncButtonText: {
    color: palette.white,
    fontWeight: '700',
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.redLight,
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  errorBannerText: {
    color: palette.red,
    fontSize: 12,
    flex: 1,
  },
  helperText: {
    fontSize: 12,
    color: palette.gray,
    lineHeight: 18,
  },
  testInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  testInput: {
    flex: 1,
    height: 42,
    backgroundColor: palette.backgroundLight,
    borderWidth: 1,
    borderColor: palette.borderLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: palette.navy,
  },
  testButton: {
    backgroundColor: palette.navy,
    paddingHorizontal: 18,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testButtonText: {
    color: palette.white,
    fontWeight: '700',
    fontSize: 13,
  },
});
