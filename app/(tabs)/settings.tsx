import React, { useEffect } from 'react';
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
  Settings,
  Bell,
  EyeOff,
  RefreshCw,
  Shield,
  Palette,
  Lock,
  Info,
  CheckCircle2,
} from 'lucide-react-native';
import { palette } from '@/theme/colors';
import { Card } from '@/components/Card';
import { useProtectionStore } from '@/features/protection/protection.store';
import { BlockMode, AppTheme } from '@/types';

export default function SettingsScreen() {
  const { settings, loadSettings, updateSettings } = useProtectionStore();

  useEffect(() => {
    loadSettings();
  }, []);

  const handleToggleAutoSync = async (val: boolean) => {
    await updateSettings({ automatic_sync: val ? 1 : 0 });
  };

  const handleToggleNotifications = async (val: boolean) => {
    await updateSettings({ notification_enabled: val ? 1 : 0 });
  };

  const handleToggleBlockAds = async (val: boolean) => {
    await updateSettings({ block_ads: val ? 1 : 0 });
  };

  const handleSetBlockMode = async (mode: BlockMode) => {
    await updateSettings({ block_mode: mode });
  };

  const handleSetTheme = async (theme: AppTheme) => {
    await updateSettings({ theme });
  };

  const showPrivacyPolicy = () => {
    Alert.alert(
      'Política de Privacidade e Segurança Local',
      'O BetsBlocker foi desenhado estritamente sob a premissa de Zero-Backend e Privacidade Absoluta:\n\n' +
        '1. Todos os domínios, listas e logs residem exclusivamente no SQLite do dispositivo.\n' +
        '2. Nenhum histórico de navegação, URL ou conteúdo de páginas é interceptado, gravado ou transmitido.\n' +
        '3. Somente domínios catalogados em fontes oficiais e verificadas são processados para bloqueio.\n' +
        '4. Você possui controle total para adicionar domínios manuais ou registrar exceções de liberação imediata.'
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Sincronização e Notificações */}
      <Card>
        <Text style={styles.sectionTitle}>Geral e Automação</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingTextWrapper}>
            <View style={styles.settingLabelRow}>
              <RefreshCw size={18} color={palette.navy} />
              <Text style={styles.settingLabel}>Sincronização Automática</Text>
            </View>
            <Text style={styles.settingDescription}>
              Verifica atualizações em segundo plano quando conectado ao Wi-Fi.
            </Text>
          </View>
          <Switch
            value={settings.automatic_sync === 1}
            onValueChange={handleToggleAutoSync}
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

        <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
          <View style={styles.settingTextWrapper}>
            <View style={styles.settingLabelRow}>
              <Bell size={18} color={palette.navy} />
              <Text style={styles.settingLabel}>Notificações do Sistema</Text>
            </View>
            <Text style={styles.settingDescription}>
              Avisar quando novas listas forem aplicadas ou bloqueios ocorrerem.
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
            Bloqueia imediatamente todos os domínios confirmados como não autorizados e os adicionados manualmente.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.optionCard, settings.block_mode === 'PERMISSIVE' && styles.optionCardSelected]}
          onPress={() => handleSetBlockMode('PERMISSIVE')}
        >
          <View style={styles.optionHeader}>
            <Text style={styles.optionTitle}>Permissivo</Text>
            {settings.block_mode === 'PERMISSIVE' && (
              <CheckCircle2 size={18} color={palette.teal} />
            )}
          </View>
          <Text style={styles.optionDescription}>
            Bloqueia apenas domínios com atos normativos oficiais expressos do Ministério da Fazenda.
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
            Não bloqueia conexões; apenas registra no histórico para fins de inspeção e monitoramento.
          </Text>
        </TouchableOpacity>
      </Card>

      {/* Tema Visual */}
      <Card>
        <Text style={styles.sectionTitle}>Aparência e Tema</Text>

        <View style={styles.themeSelector}>
          {(['system', 'light', 'dark'] as AppTheme[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[
                styles.themeBtn,
                settings.theme === t && styles.themeBtnSelected,
              ]}
              onPress={() => handleSetTheme(t)}
            >
              <Text
                style={[
                  styles.themeBtnText,
                  settings.theme === t && styles.themeBtnTextSelected,
                ]}
              >
                {t === 'system' ? 'Sistema' : t === 'light' ? 'Claro' : 'Escuro'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
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
          <Text style={styles.appInfoValue}>1.0.0 (Build Android)</Text>
        </View>

        <View style={styles.appInfoRow}>
          <Text style={styles.appInfoLabel}>Motor Local:</Text>
          <Text style={styles.appInfoValue}>Expo SQLite v15 (WAL Mode)</Text>
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
  themeSelector: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  themeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: palette.backgroundLight,
    borderWidth: 1,
    borderColor: palette.borderLight,
    alignItems: 'center',
  },
  themeBtnSelected: {
    backgroundColor: palette.navy,
    borderColor: palette.navy,
  },
  themeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.navy,
  },
  themeBtnTextSelected: {
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
