import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Ban, ListFilter } from 'lucide-react-native';
import { palette } from '@/theme/colors';
import { EmptyState } from '@/components/EmptyState';
import { useDomainsStore } from '@/features/domains/domains.store';
import { protectionService } from '@/services/protection.service';

export default function RecentDomainsScreen() {
  const { addUserDomain } = useDomainsStore();
  const [domains, setDomains] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadDomains = useCallback(async () => {
    setRefreshing(true);
    setDomains(await protectionService.getRecentDomains());
    setRefreshing(false);
  }, []);

  useEffect(() => {
    protectionService.getRecentDomains().then(setDomains);
  }, []);

  const handleBlock = async (domain: string) => {
    const success = await addUserDomain(
      domain,
      'Bloqueado pelo usuário em Domínios Recentes.',
      'user_ads_trackers'
    );
    if (success) {
      setDomains((current) => current.filter((item) => item !== domain));
    } else {
      Alert.alert('Não Bloqueado', `O domínio ${domain} é protegido ou inválido.`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Voltar">
          <ArrowLeft size={24} color={palette.navy} />
        </TouchableOpacity>
        <Text style={styles.title}>Domínios Recentes</Text>
      </View>
      <Text style={styles.description}>
        Últimos domínios acessados e não bloqueados neste celular. Bloqueie só o que reconhecer: um
        domínio necessário pode impedir sites ou apps de funcionar. Esta lista fica apenas na
        memória e é apagada ao desativar a proteção.
      </Text>

      <FlatList
        data={domains}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadDomains} />}
        ListEmptyComponent={
          <EmptyState
            icon={ListFilter}
            title="Nenhum domínio recente"
            description="Ative a proteção, use o celular normalmente e puxe para atualizar."
          />
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.domain} numberOfLines={1}>
              {item}
            </Text>
            <TouchableOpacity
              style={styles.blockButton}
              onPress={() => handleBlock(item)}
              accessibilityLabel={`Bloquear ${item}`}
            >
              <Ban size={16} color={palette.white} />
              <Text style={styles.blockText}>Bloquear</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.navy,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    color: palette.gray,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.grayLight,
  },
  domain: {
    flex: 1,
    fontSize: 14,
    color: palette.navy,
  },
  blockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.teal,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  blockText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.white,
  },
});
