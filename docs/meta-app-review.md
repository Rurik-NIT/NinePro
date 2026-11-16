# Guia — aprovação do app da Meta (NinePro)

Objetivo: liberar o botão **Conectar com Facebook** para qualquer cliente (hoje, em modo de desenvolvimento, só quem tem papel no app consegue conectar).

## 0. Antes de começar

- [ ] Preencher os dados da empresa em `src/config/legal.ts` (razão social, CNPJ, endereço, e-mails, encarregado, foro) e publicar.
- [ ] Pedir revisão jurídica da Política de Privacidade e dos Termos (textos-base prontos, alinhados à LGPD).
- [ ] Rodar a migração `supabase/migrations/20261116000006_ninepro_data_deletion.sql` no SQL Editor.
- [ ] `META_APP_ID` e `META_APP_SECRET` no `.env.local` e na Vercel.

## 1. Configurações do app (developers.facebook.com)

**Configurações do app › Básico**

| Campo | Valor |
|---|---|
| Domínios do app | `ninepro.vercel.app` |
| URL da Política de Privacidade | `https://ninepro.vercel.app/privacidade` |
| URL dos Termos de Serviço | `https://ninepro.vercel.app/termos` |
| Exclusão de dados do usuário | **URL de retorno de chamada**: `https://ninepro.vercel.app/api/meta-exclusao` |
| Ícone do app | 1024×1024 (logo do NinePro) |
| Categoria | Negócios e páginas |

**Login do Facebook › Configurações**

| Campo | Valor |
|---|---|
| URIs de redirecionamento OAuth válidos | `https://ninepro.vercel.app/api/connect` (e `http://localhost:5179/api/connect` para testes) |
| URL de retorno de chamada para cancelar autorização | `https://ninepro.vercel.app/api/meta-desautorizar` |
| Login OAuth do cliente / Login OAuth na Web | Ativados |
| Forçar HTTPS | Ativado |

## 2. Verificação da empresa

**Configurações do app › Básico › Verificação** (ou Central de Segurança do portfólio empresarial).
Documentos usuais: cartão CNPJ, comprovante de endereço ou conta de consumo no nome da empresa, domínio/e-mail corporativo. Prazo típico: 2 a 10 dias úteis.

## 3. Permissões a pedir (Revisão do app › Permissões e recursos)

Pedir **Acesso avançado** para:

| Permissão | Para quê no NinePro |
|---|---|
| `ads_read` | Ler contas, campanhas, conjuntos, anúncios e métricas |
| `ads_management` | Pausar e ativar campanhas a pedido do usuário |
| `business_management` | Listar as contas de anúncio que pertencem ao portfólio empresarial do cliente |

Textos para colar (a revisão é em inglês):

**ads_read**
> NinePro is a paid-traffic management dashboard for businesses and agencies. After a workspace administrator connects their Facebook account, we use ads_read to import the ad accounts, campaigns, ad sets, ads and daily insights (spend, impressions, reach, clicks, leads, purchases and purchase value) that the user has access to. This data is shown only to members of that customer's workspace in the Overview, Campaigns and Creatives screens, and is used by the customer's automated rules and their own integrations. We do not use the data for advertising, profiling or any purpose other than providing these features to the customer who authorized the connection.

**ads_management**
> Users can pause or activate their own campaigns directly from NinePro (Campaigns screen or their automation rules). When the user clicks "Pause" or "Activate" on a campaign that came from a connected Meta ad account, we use ads_management to update that campaign's status through the Marketing API. NinePro never creates, edits or deletes ads, budgets or creatives; it only changes the status when the user explicitly asks for it.

**business_management**
> Many of our customers manage ad accounts that belong to a Business Portfolio rather than to their personal profile. We use business_management only to list the ad accounts the user can access through their Business Portfolio, so they can choose which accounts NinePro should sync. We do not modify any business settings, assets or users.

## 4. Roteiro do vídeo (screencast) — 2 a 3 minutos, em inglês ou com legenda

1. Abrir `https://ninepro.vercel.app`, entrar com uma conta de teste.
2. Ir em **Conexões** e clicar em **Conectar com Facebook**.
3. Mostrar a tela de autorização da Meta com as permissões pedidas e aprovar.
4. Voltar ao NinePro: mostrar a mensagem “Meta conectada” e a sincronização terminando.
5. Mostrar a lista de contas de anúncio (`business_management`) e o interruptor de sincronizar cada conta.
6. Abrir **Anúncios › Visão geral** e **Campanhas** com os dados importados (`ads_read`).
7. Pausar uma campanha no NinePro, abrir o Gerenciador de Anúncios e mostrar que ela ficou pausada lá também; ativar de novo (`ads_management`).
8. Voltar em **Conexões** e clicar em **Desconectar** (mostra que o usuário controla o acesso).

Dica: gravar com uma conta de anúncios de teste ou com campanhas de baixo orçamento, e informar ao revisor um usuário de teste com acesso ao NinePro (Revisão do app › Instruções de teste).

## 5. Enquanto a revisão não sai

- Adicionar os primeiros clientes como **Testadores** em Funções do app (Funções › Testadores). Eles aceitam o convite no Facebook e já conseguem conectar.
- Limite do modo de desenvolvimento: só contas de pessoas com papel no app.
