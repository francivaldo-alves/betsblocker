import React, { useEffect, useState } from 'react';
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

export default function DashboardScreen() {
  const { totalBlocked, totalPending, loadBlockedDomains, loadPendingDomains } =
    useDomainsStore();
  const { settings, operationalStatus, loadSettings, toggleProtection } =
    useProtectionStore();
  const { lastSync, isSyncing, syncError, loadLastSync, syncInitialList } =
    useSyncStore();
  const { todayBlockedCount, loadBlockEvents } = useHistoryStore();

  const [testDomain, setTestDomain] = useState('');
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    loadSettings();
    loadLastSync();
    loadBlockedDomains();
    loadPendingDomains();
    loadBlockEvents();
  }, []);

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
    const result = await protectionService.evaluateAndIntercept(testDomain.trim());
    setIsTesting(false);
    await loadBlockEvents();

    if (!result.allowed) {
      Alert.alert(
        '🚫 ACESSO BLOQUEADO PELO BETSBLOCKER',
        `${result.reason}\n\nO evento foi registrado na auditoria local SQLite.`
      );
    } else {
      Alert.alert('✅ ACESSO PERMITIDO', result.reason);
    }
  };

  const handleSync = async () => {
    const res = await syncInitialList();
    if (res.success) {
      await Promise.all([loadBlockedDomains(), loadPendingDomains(), loadLastSync()]);
      Alert.alert(
        'Sincronização Concluída',
        `Versão ${res.version} processada com sucesso!\n${res.addedRecords} novos domínios adicionados.\n${res.updatedRecords} domínios atualizados.`
      );
    } else {
      Alert.alert('Falha na Sincronização', res.error || 'Erro ao sincronizar listas.');
    }
  };

  const handleToggleProtection = async () => {
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
        'Proteção Inoperante',
        res.message || 'O serviço nativo de VPN local requer um Expo Development Build para operar.'
      );
    }
  };

  const isProtectionRunning = operationalStatus === 'RUNNING';

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
              {isProtectionRunning
                ? 'Proteção local ativa no dispositivo'
                : 'Proteção desativada pelo usuário'}
            </Text>
          </View>
          <Badge
            label={isProtectionRunning ? 'ATIVO' : 'INATIVO'}
            variant={isProtectionRunning ? 'success' : 'danger'}
          />
        </View>

        <TouchableOpacity
          style={[styles.toggleButton, isProtectionRunning ? styles.btnDanger : styles.btnPrimary]}
          onPress={handleToggleProtection}
        >
          <Power size={18} color={palette.white} style={{ marginRight: 8 }} />
          <Text style={styles.toggleButtonText}>
            {isProtectionRunning ? 'Desativar Proteção' : 'Ativar Proteção'}
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
          <Text style={styles.cardTitle}>Interceptações Registradas Hoje</Text>
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
          Experimente testar qualquer domínio restrito (ex: blaze.com, api.pgsoft.com, qualquer.bet) para verificar o motor de proteção:
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
            {lastSync ? `Versão ${lastSync.version}` : 'Nenhuma (base inicial pendente)'}
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
                {totalBlocked === 0 ? 'Importar Lista Inicial Oficial' : 'Sincronizar Atualizações'}
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
