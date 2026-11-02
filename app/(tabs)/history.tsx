import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { History, ShieldAlert, CheckCircle, XCircle, Calendar, Tag } from 'lucide-react-native';
import { palette } from '@/theme/colors';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { useHistoryStore } from '@/features/history/history.store';
import { SyncHistory, BlockEvent } from '@/types';

export default function HistoryScreen() {
  const [activeTab, setActiveTab] = useState<'SYNCS' | 'EVENTS'>('SYNCS');
  const { syncHistory, blockEvents, isLoading, loadSyncHistory, loadBlockEvents } =
    useHistoryStore();

  useEffect(() => {
    loadSyncHistory();
    loadBlockEvents();
  }, []);

  const renderSyncItem = ({ item }: { item: SyncHistory }) => (
    <Card style={styles.historyCard}>
      <View style={styles.historyHeader}>
        <View style={styles.versionWrapper}>
          <Text style={styles.versionTitle}>Versão {item.version}</Text>
          <Text style={styles.historyDate}>
            {new Date(item.synced_at).toLocaleString('pt-BR')}
          </Text>
        </View>
        <Badge
          label={item.status === 'SUCCESS' ? 'Sucesso' : 'Falha'}
          variant={item.status === 'SUCCESS' ? 'success' : 'danger'}
        />
      </View>

      <View style={styles.syncStatsRow}>
        <View style={styles.syncStatBox}>
          <Text style={styles.syncStatNumber}>{item.total_records}</Text>
          <Text style={styles.syncStatLabel}>Total</Text>
        </View>
        <View style={styles.syncStatBox}>
          <Text style={[styles.syncStatNumber, { color: palette.green }]}>+{item.added_records}</Text>
          <Text style={styles.syncStatLabel}>Novos</Text>
        </View>
        <View style={styles.syncStatBox}>
          <Text style={[styles.syncStatNumber, { color: palette.teal }]}>{item.updated_records}</Text>
          <Text style={styles.syncStatLabel}>Atualizados</Text>
        </View>
      </View>

      {item.error_message && (
        <Text style={styles.syncErrorText}>Erro: {item.error_message}</Text>
      )}
    </Card>
  );

  const renderBlockEventItem = ({ item }: { item: BlockEvent }) => (
    <Card style={styles.historyCard}>
      <View style={styles.historyHeader}>
        <Text style={styles.eventDomain} numberOfLines={1}>
          {item.domain}
        </Text>
        <Badge label="Interceptado" variant="danger" />
      </View>

      <Text style={styles.eventReason}>{item.block_reason}</Text>

      <View style={styles.eventFooter}>
        <Calendar size={13} color={palette.gray} />
        <Text style={styles.eventDate}>
          {new Date(item.blocked_at).toLocaleString('pt-BR')}
        </Text>
      </View>
    </Card>
  );

  return (
    <View style={styles.container}>
      {/* Abas Superiores */}
      <View style={styles.tabSelector}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'SYNCS' && styles.tabButtonActive]}
          onPress={() => setActiveTab('SYNCS')}
        >
          <History size={16} color={activeTab === 'SYNCS' ? palette.navy : palette.gray} />
          <Text
            style={[styles.tabButtonText, activeTab === 'SYNCS' && styles.tabButtonTextActive]}
          >
            Sincronizações ({syncHistory.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'EVENTS' && styles.tabButtonActive]}
          onPress={() => setActiveTab('EVENTS')}
        >
          <ShieldAlert size={16} color={activeTab === 'EVENTS' ? palette.navy : palette.gray} />
          <Text
            style={[styles.tabButtonText, activeTab === 'EVENTS' && styles.tabButtonTextActive]}
          >
            Bloqueios Realizados ({blockEvents.length})
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'SYNCS' ? (
        <FlatList
          data={syncHistory}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderSyncItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            !isLoading ? (
              <EmptyState
                icon={History}
                title="Nenhuma sincronização realizada"
                description="O histórico de atualizações das listas locais aparecerá aqui."
              />
            ) : undefined
          }
        />
      ) : (
        <FlatList
          data={blockEvents}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderBlockEventItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            !isLoading ? (
              <EmptyState
                icon={ShieldAlert}
                title="Nenhum bloqueio registrado"
                description="Quando o serviço interceptar requisições para domínios proibidos, elas serão catalogadas aqui."
              />
            ) : undefined
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.backgroundLight,
  },
  tabSelector: {
    flexDirection: 'row',
    backgroundColor: palette.white,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderLight,
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: palette.teal,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.gray,
  },
  tabButtonTextActive: {
    color: palette.navy,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
  },
  historyCard: {
    marginBottom: 10,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  versionWrapper: {
    flex: 1,
  },
  versionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.navy,
  },
  historyDate: {
    fontSize: 12,
    color: palette.gray,
    marginTop: 2,
  },
  syncStatsRow: {
    flexDirection: 'row',
    backgroundColor: palette.backgroundLight,
    borderRadius: 8,
    padding: 8,
    marginTop: 6,
  },
  syncStatBox: {
    flex: 1,
    alignItems: 'center',
  },
  syncStatNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.navy,
  },
  syncStatLabel: {
    fontSize: 11,
    color: palette.gray,
    marginTop: 2,
  },
  syncErrorText: {
    fontSize: 12,
    color: palette.red,
    marginTop: 6,
  },
  eventDomain: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.navy,
    flex: 1,
    marginRight: 8,
  },
  eventReason: {
    fontSize: 13,
    color: palette.grayDark,
    marginBottom: 6,
  },
  eventFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  eventDate: {
    fontSize: 12,
    color: palette.gray,
  },
});
