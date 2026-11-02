# BetsBlocker — Documentação de Arquitetura, Limitações e Privacidade

## 1. Princípios de Privacidade e Proteção de Dados (LGPD)

O aplicativo **BetsBlocker** não tem backend próprio e processa tudo no aparelho:

1. **Armazenamento local:** listas de domínios, ajustes, revisões e histórico de bloqueios ficam no SQLite do dispositivo Android.
2. **Sem leitura de conteúdo:** o app não atua como proxy e não vê páginas, cookies, cabeçalhos ou formulários. Ele vê apenas os nomes de domínio das consultas DNS.
3. **O que é gravado:** só tentativas de acesso a domínios de apostas (`block_events`). Antes de chegarem ao SQLite, elas ficam em um arquivo privado do app, porque a VPN funciona com o app fechado.
4. **Domínios Recentes:** os últimos 200 domínios permitidos ficam apenas em memória e são apagados ao desativar a proteção. Eles nunca vão para o disco nem para o logcat.
5. **O que sai do aparelho:** consultas permitidas seguem para o DNS da rede atual. Se ele falhar, seguem para Google (8.8.8.8, 8.8.4.4) ou Cloudflare (1.1.1.1). Quando a atualização remota estiver configurada, o app também baixa a lista do endereço definido em `app.json`. Não há telemetria.
6. **Listas são dados:** arquivos de lista contêm apenas JSON validado com Zod. A lista remota só é aceita com assinatura ECDSA P-256 válida.

---

## 2. Limitações Técnicas

1. **Não há bloqueio absoluto:** novos domínios e espelhos surgem com frequência. A proteção é preventiva e depende da lista.

2. **O filtro atua só no DNS:** apps que usam DNS criptografado próprio (DoH/DoT, como navegadores configurados com "DNS seguro"), endereços IP fixos ou outra VPN não passam pelo filtro. Por usar a VPN do Android, o BetsBlocker não funciona junto com outra VPN.

3. **DNS privado do Android:** verifique em aparelho real se um provedor configurado manualmente ignora o filtro. O app ainda não detecta nem avisa sobre esse caso.

4. **Apenas UDP:** a interface virtual atende consultas DNS por UDP. Quando uma resposta não cabe, o próprio app repete a consulta por TCP no servidor e devolve o resultado por UDP. Consultas enviadas diretamente por TCP ficam sem resposta.

5. **Segundo plano:** a proteção roda como serviço em primeiro plano, religa após reiniciar o aparelho ou atualizar o app e aceita a opção "VPN sempre ativa" do Android. Fabricantes com gestão agressiva de bateria ainda podem encerrá-la; nesse caso, o app mostra "INTERROMPIDO" e religa ao ser aberto, se a permissão continuar válida.

6. **A trava de compromisso cria atrito, não impedimento:** ela depende do relógio do aparelho e não impede desinstalar o app ou revogar a VPN nas configurações do Android.

7. **Módulo nativo obrigatório:** a proteção só existe em build Android do app (`npx expo run:android` ou EAS). No Expo Go, iOS e web, o app informa que ela está indisponível, sem simular proteção.

---

## 3. Lista de Bloqueio e Atualizações

- **Procedência:** a lista embutida é uma curadoria do projeto, não uma publicação oficial do Ministério da Fazenda ou da Anatel. Confirme cada domínio antes de divulgá-lo como oficial.
- **Casas licenciadas:** `*.bet.br` usa a categoria `licensed_operators` e pode ser desligado em Ajustes. A regra vem ligada porque o público do app quer parar de apostar, não só evitar sites ilegais.
- **Atualizar a lista embutida:** edite `assets/data/initial-blocklist.json` e rode `node scripts/build-blocklist.mjs <versão>`.
- **Publicar lista remota:**
  1. Gere a chave com `node scripts/build-blocklist.mjs --generate-key blocklist-private.pem` e guarde-a fora do repositório.
  2. Coloque a chave pública em `extra.blocklist.publicKey` no `app.json`, junto de `manifestUrl` e `listUrl`.
  3. Gere o manifesto assinado com `node scripts/build-blocklist.mjs <versão> blocklist-private.pem`.
  4. Publique os dois arquivos em `assets/data` sem alterar nenhum byte.

---

## 4. Antes de Publicar

- **Google Play:** revise as regras de `VpnService` e a declaração exigida. O bloqueio de anúncios de outros apps pode violar a política de abuso de dispositivo e rede.
- **Licenças:** o arquivo `LICENSE` ainda é o da Expo. A lista de anúncios inclui HaGeZi (GPL-3.0) e StevenBlack (MIT): avalie as obrigações antes de distribuir o app.

---

## 5. Guia de Compilação para Dispositivo Físico (EAS Build)

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
