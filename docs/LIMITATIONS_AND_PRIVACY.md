# BetsBlocker — Documentação de Arquitetura, Limitações e Privacidade

## 1. Princípios de Privacidade e Proteção de Dados (LGPD)

O aplicativo **BetsBlocker** adota a premissa de **Zero-Backend** e **Local-Only Processing**:

1. **Armazenamento 100% Local:** Todas as tabelas relacionais, listas de domínios, registros de auditoria, notas de revisão e histórico de eventos residem exclusivamente no SQLite local do dispositivo Android.
2. **Não Coleta de Histórico de Navegação:** O aplicativo não atua como rastreador, proxy de interceptação de conteúdo ou analisador de tráfego HTTP. Ele não grava páginas visitadas, cookies, cabeçalhos nem dados de formulários.
3. **Registro Restrito a Eventos de Segurança:** Somente quando uma consulta DNS corresponde a um domínio listado como restrito em `blocked_domains` (e sem exceção ativa) é que um registro de bloqueio (`block_events`) é gerado localmente.
4. **Sem Telemetria ou Envio Remoto:** Nenhuma informação sobre consultas de rede, endereço IP ou identificadores do dispositivo é transmitida a servidores remotos.
5. **Execução de Código Seguro:** Arquivos de atualização (`initial-blocklist.json` e manifesto) contêm apenas dados estáticos JSON parseados com Zod. O aplicativo rejeita e não executa nenhum script, bytecode ou comando vindo de fontes externas.

---

## 2. Limitações Técnicas e Regulatórias

1. **Não Bloqueio Absoluto:**
   - Nenhum sistema de filtragem de rede local pode garantir 100% de bloqueio. Operadores clandestinos criam novos subdomínios, redirecionamentos e espelhos dinâmicos (mirror domains) com alta frequência.
   - O aplicativo atua como camada de proteção preventiva com base nas relações oficiais vigentes.

2. **DNS Criptografado e DNS Privado (DoT / DoH):**
   - No Android 9 ou superior, quando a funcionalidade *DNS Privado* (Private DNS) está configurada com um provedor externo que utiliza DNS-over-TLS (porta 853), certas requisições de sistema podem ignorar o DNS da interface loopback local caso o `VpnService` não redirecione especificamente as portas 853 e 443.
   - O modo *Estrito* do BetsBlocker intercepta o tráfego DNS convencional (UDP/TCP 53) e reporta ao usuário a necessidade de manter o DNS Privado configurado para modo automático ou desativado em redes locais protegidas.

3. **Execução em Segundo Plano no Android (Doze Mode):**
   - O sistema de gerenciamento de bateria agressivo de certos fabricantes de hardware Android (MIUI, OneUI, etc.) pode suspender processos em segundo plano. O motor de proteção deve ser configurado como *Serviço de Primeiro Plano* (`Foreground Service`) com notificação persistente para assegurar filtragem contínua.

4. **Necessidade de Expo Development Build para Interceptação de Rede Real:**
   - O aplicativo Expo em sua camada JavaScript/TypeScript está 100% pronto e estruturado. Porém, o módulo nativo que implementa o `android.net.VpnService` só opera dentro de um **Expo Development Build** (`eas build --profile development` ou `npx expo run:android`), pois a runtime do Expo Go não inclui módulos nativos de rede personalizados.
   - O BetsBlocker adota a diretriz de **não simular proteção**: se o ambiente não possuir o driver nativo ativo, o aplicativo informa abertamente que a proteção está inoperante.

---

## 3. Fontes Oficiais e Governança

- **Ministério da Fazenda (SPA/MF):** Relações de empresas autorizadas a operar apostas de quota fixa conforme a Lei nº 14.790/2023 e portarias correlatas.
- **SIGAP (Sistema de Gestão de Apostas):** Base de consulta de pedidos e homologações.
- **Notificações Anatel:** Listagens de despachos determinando o bloqueio de sítios não autorizados pelas prestadoras de telecomunicações.

---

## 4. Guia de Compilação para Dispositivo Físico (EAS Build)

Para gerar o APK ou Android App Bundle definitivo com suporte ao serviço local:

```powershell
# 1. Login no Expo Application Services (se necessário)
npx eas-cli login

# 2. Configurar o projeto no EAS
npx eas-cli project:init

# 3. Gerar o build de desenvolvimento Android
npx eas-cli build --profile development --platform android

# 4. Ou compilar localmente com Android SDK configurado
npx expo run:android
```
