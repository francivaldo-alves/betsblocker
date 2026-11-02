import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {
  Bell,
  Building2,
  ChevronRight,
  EyeOff,
  Hourglass,
  ListFilter,
  RefreshCw,
  Lock,
  CheckCircle2,
} from 'lucide-react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { palette } from '@/theme/colors';
import { Card } from '@/components/Card';
import { useProtectionStore } from '@/features/protection/protection.store';
import { blocklistSyncService } from '@/services/blocklist-sync.service';
import {
  COMMITMENT_DELAY_OPTIONS,
  UNLOCK_WINDOW_HOURS,
  getCommitmentState,
} from '@/services/commitment.service';
import { requestNotificationPermission } from '@/utils/notifications';
import { BlockMode, ProtectionSettings } from '@/types';

export default function SettingsScreen() {
  const { settings, updateSettings, requestUnlock, cancelUnlock } = useProtectionStore();
  const commitment = getCommitmentState(settings);
  const hasRemoteList = blocklistSyncService.getRemoteConfig() !== null;
  const appVersion = Constants.expoConfig?.version ?? '-';

  const applySettings = async (patch: Partial<ProtectionSettings>) => {
    try {
      await updateSettings(patch);
    } catch (err: any) {
      Alert.alert('Alteração Não Aplicada', err?.message || 'Não foi possível salvar o ajuste.');
    }
  };

  const handleToggleAutoSync = (val: boolean) => applySettings({ automatic_sync: val ? 1 : 0 });

  const handleToggleNotifications = async (val: boolean) => {
    if (val) await requestNotificationPermission();
    await applySettings({ notification_enabled: val ? 1 : 0 });
  };

  const handleToggleBlockAds = (val: boolean) => applySettings({ block_ads: val ? 1 : 0 });

  const handleToggleLicensed = (val: boolean) => applySettings({ block_licensed: val ? 1 : 0 });

  const handleSetBlockMode = (mode: BlockMode) => applySettings({ block_mode: mode });

  const handleSetDelay = (hours: number) => applySettings({ commitment_delay_hours: hours });

  const showPrivacyPolicy = () => {
    Alert.alert(
      'Política de Privacidade e Segurança Local',
      'O BetsBlocker funciona sem servidor próprio:\n\n' +
        '1. Listas, ajustes e o histórico de bloqueios ficam só neste aparelho.\n' +
        '2. O conteúdo das páginas não é lido. O app vê apenas o nome dos sites nas consultas DNS.\n' +
        '3. Só tentativas de acesso a sites de apostas são gravadas. Os demais domínios ficam em memória e somem ao desativar a proteção.\n' +
        '4. Consultas permitidas seguem para o DNS da sua rede ou, se ele falhar, para Google ou Cloudflare.'
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Sincronização e Notificações */}
      <Card>
        <Text style={styles.sectionTitle}>Geral e Automação</Text>

        {hasRemoteList && (
          <View style={styles.settingRow}>
            <View style={styles.settingTextWrapper}>
              <View style={styles.settingLabelRow}>
                <RefreshCw size={18} color={palette.navy} />
                <Text style={styles.settingLabel}>Sincronização Automática</Text>
              </View>
              <Text style={styles.settingDescription}>
                Procura uma nova lista uma vez por dia, ao abrir o app.
              </Text>
            </View>
            <Switch
              value={settings.automatic_sync === 1}
              onValueChange={handleToggleAutoSync}
              trackColor={{ false: palette.grayLight, true: palette.teal }}
              thumbColor={palette.white}
            />
          </View>
        )}

        <View style={styles.settingRow}>
          <View style={styles.settingTextWrapper}>
            <View style={styles.settingLabelRow}>
              <Building2 size={18} color={palette.navy} />
              <Text style={styles.settingLabel}>Bloquear Casas Licenciadas (.bet.br)</Text>
            </View>
            <Text style={styles.settingDescription}>
              Inclui as operadoras autorizadas no Brasil, que usam o domínio .bet.br.
            </Text>
          </View>
          <Switch
            value={settings.block_licensed === 1}
            onValueChange={handleToggleLicensed}
            trackColor={{ false: palette.grayLight, true: palette.teal }}
            thumbColor={palette.white}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingTextWrapper}>
            <View style={styles.settingLabelRow}>
              <EyeOff size={18} color={palette.navy} />
              <Text style={styles.settingLabel}>Bloquear Anúncios e Rastreadores</Text>
            </View>
            <Text style={styles.settingDescription}>
              Filtra domínios conhecidos de publicidade, rastreamento e malware. Alguns sites podem
              apresentar falhas; libere-os como exceção.
            </Text>
          </View>
          <Switch
            value={settings.block_ads === 1}
            onValueChange={handleToggleBlockAds}
            trackColor={{ false: palette.grayLight, true: palette.teal }}
            thumbColor={palette.white}
          />
        </View>

        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => router.push('/recent-domains')}
          accessibilityRole="button"
        >
          <View style={styles.settingTextWrapper}>
            <View style={styles.settingLabelRow}>
              <ListFilter size={18} color={palette.navy} />
              <Text style={styles.settingLabel}>Domínios Recentes</Text>
            </View>
            <Text style={styles.settingDescription}>
              Veja o que seu celular acessou e bloqueie com um toque.
            </Text>
          </View>
          <ChevronRight size={20} color={palette.gray} />
        </TouchableOpacity>

        <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
          <View style={styles.settingTextWrapper}>
            <View style={styles.settingLabelRow}>
              <Bell size={18} color={palette.navy} />
              <Text style={styles.settingLabel}>Notificações do Sistema</Text>
            </View>
            <Text style={styles.settingDescription}>
              Avisar quando um site de apostas for bloqueado.
            </Text>
          </View>
          <Switch
            value={settings.notification_enabled === 1}
            onValueChange={handleToggleNotifications}
            trackColor={{ false: palette.grayLight, true: palette.teal }}
            thumbColor={palette.white}
          />
        </View>
      </Card>

      {/* Compromisso */}
      <Card>
        <View style={styles.settingLabelRow}>
          <Hourglass size={18} color={palette.navy} />
          <Text style={styles.settingLabel}>Trava de Compromisso</Text>
        </View>
        <Text style={styles.sectionDescription}>
          Cria uma espera para desativar a proteção, liberar sites ou reduzir os bloqueios. Ela dá
          tempo para o impulso passar.
        </Text>

        <View style={styles.delaySelector}>
          {COMMITMENT_DELAY_OPTIONS.map((hours) => (
            <TouchableOpacity
              key={hours}
              style={[
                styles.delayBtn,
                settings.commitment_delay_hours === hours && styles.delayBtnSelected,
              ]}
              onPress={() => handleSetDelay(hours)}
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.delayBtnText,
                  settings.commitment_delay_hours === hours && styles.delayBtnTextSelected,
                ]}
              >
                {hours === 0 ? 'Desligada' : `${hours}h`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {settings.commitment_delay_hours > 0 && (
          <>
            <Text style={styles.commitmentStatus}>
              {commitment.pending && commitment.unlockAt
                ? `Liberação prevista para ${commitment.unlockAt.toLocaleString('pt-BR')}. Depois disso, você terá ${UNLOCK_WINDOW_HOURS}h para fazer a alteração.`
                : commitment.locked
                  ? 'Travado. Solicite a liberação e aguarde o prazo.'
                  : 'Liberado agora. A trava volta sozinha ao fim do período.'}
            </Text>
            {commitment.pending ? (
              <TouchableOpacity style={styles.commitmentButton} onPress={cancelUnlock}>
                <Text style={styles.commitmentButtonText}>Cancelar Solicitação</Text>
              </TouchableOpacity>
            ) : commitment.locked ? (
              <TouchableOpacity style={styles.commitmentButton} onPress={requestUnlock}>
                <Text style={styles.commitmentButtonText}>Solicitar Liberação</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </Card>

      {/* Modo de Bloqueio */}
      <Card>
        <Text style={styles.sectionTitle}>Modo de Filtragem</Text>
        <Text style={styles.sectionDescription}>
          Define o rigor aplicado pelo motor de filtragem de rede local:
        </Text>

        <TouchableOpacity
          style={[styles.optionCard, settings.block_mode === 'STRICT' && styles.optionCardSelected]}
          onPress={() => handleSetBlockMode('STRICT')}
        >
          <View style={styles.optionHeader}>
            <Text style={styles.optionTitle}>Estrito (Recomendado)</Text>
            {settings.block_mode === 'STRICT' && (
              <CheckCircle2 size={18} color={palette.teal} />
            )}
          </View>
          <Text style={styles.optionDescription}>
            Bloqueia todos os domínios da lista e os adicionados por você.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.optionCard, settings.block_mode === 'AUDIT' && styles.optionCardSelected]}
          onPress={() => handleSetBlockMode('AUDIT')}
        >
          <View style={styles.optionHeader}>
            <Text style={styles.optionTitle}>Auditoria (Passivo)</Text>
            {settings.block_mode === 'AUDIT' && (
              <CheckCircle2 size={18} color={palette.teal} />
            )}
          </View>
          <Text style={styles.optionDescription}>
            Não bloqueia nada: só registra no histórico os acessos a sites de apostas.
          </Text>
        </TouchableOpacity>
      </Card>

      {/* Privacidade e Informações do App */}
      <Card>
        <Text style={styles.sectionTitle}>Privacidade e Informações</Text>

        <TouchableOpacity style={styles.linkRow} onPress={showPrivacyPolicy}>
          <View style={styles.settingLabelRow}>
            <Lock size={18} color={palette.navy} />
            <Text style={styles.linkLabel}>Política de Privacidade Local</Text>
          </View>
          <Text style={styles.linkArrow}>›</Text>
        </TouchableOpacity>

        <View style={styles.appInfoRow}>
          <Text style={styles.appInfoLabel}>Versão do BetsBlocker:</Text>
          <Text style={styles.appInfoValue}>{appVersion}</Text>
        </View>

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
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.navy,
    marginBottom: 10,
  },
  sectionDescription: {
    fontSize: 13,
    color: palette.gray,
    marginBottom: 12,
    lineHeight: 18,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderLight,
  },
  settingTextWrapper: {
    flex: 1,
    marginRight: 12,
  },
  settingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.navy,
  },
  settingDescription: {
    fontSize: 12,
    color: palette.gray,
    lineHeight: 16,
  },
  optionCard: {
    backgroundColor: palette.backgroundLight,
    borderWidth: 1,
    borderColor: palette.borderLight,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  optionCardSelected: {
    borderColor: palette.teal,
    backgroundColor: '#F0FDFA',
  },
  optionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.navy,
  },
  optionDescription: {
    fontSize: 12,
    color: palette.grayDark,
    lineHeight: 16,
  },
  delaySelector: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  delayBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: palette.backgroundLight,
    borderWidth: 1,
    borderColor: palette.borderLight,
    alignItems: 'center',
  },
  delayBtnSelected: {
    backgroundColor: palette.navy,
    borderColor: palette.navy,
  },
  delayBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.navy,
  },
  delayBtnTextSelected: {
    color: palette.white,
  },
  commitmentStatus: {
    fontSize: 12,
    color: palette.grayDark,
    lineHeight: 16,
    marginTop: 12,
  },
  commitmentButton: {
    backgroundColor: palette.navy,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  commitmentButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.white,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderLight,
  },
  linkLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.navy,
  },
  linkArrow: {
    fontSize: 20,
    color: palette.gray,
    fontWeight: '700',
  },
  appInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  appInfoLabel: {
    fontSize: 12,
    color: palette.gray,
  },
  appInfoValue: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.navy,
  },
});
