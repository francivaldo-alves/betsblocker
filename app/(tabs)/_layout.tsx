import { Tabs } from 'expo-router';
import { Shield, ShieldAlert, Clock, History, Settings } from 'lucide-react-native';
import { palette } from '@/theme/colors';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: palette.navy,
        },
        headerTintColor: palette.white,
        headerTitleStyle: {
          fontWeight: '700',
        },
        tabBarActiveTintColor: palette.teal,
        tabBarInactiveTintColor: palette.gray,
        tabBarStyle: {
          backgroundColor: palette.cardLight,
          borderTopColor: palette.borderLight,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Início',
          tabBarIcon: ({ color, size }) => <Shield size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="blocked-sites"
        options={{
          title: 'Sites Bloqueados',
          tabBarLabel: 'Bloqueados',
          tabBarIcon: ({ color, size }) => <ShieldAlert size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="pending-sites"
        options={{
          title: 'Pendências',
          tabBarLabel: 'Análise',
          tabBarIcon: ({ color, size }) => <Clock size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Histórico',
          tabBarLabel: 'Histórico',
          tabBarIcon: ({ color, size }) => <History size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Configurações',
          tabBarLabel: 'Ajustes',
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
