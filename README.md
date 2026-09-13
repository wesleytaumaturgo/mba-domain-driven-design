# MBA Full Cycle - Domain Driven Design

Este repositório contém o código-fonte e material didático do curso de Domain Driven Design do MBA Full Cycle.

O projeto é feito com Nestjs, mas o conteúdo é independente de linguagem ou framework.

## Pré-requisitos

- Node.js 18+
- Docker

## Executar o projeto

Suba as aplicações MySQL, RabbitMQ e Redis:

```bash
docker-compose up -d
```

Instale as dependências do Node.js:

```bash
npm install
```

Use o arquivo `api.http` como referência para fazer as requisições HTTP. Este arquivo funciona com a extensão [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) do VSCode.

## Entrega — Lista de espera de ingressos

Esta seção documenta a feature de cancelamento de pedido com liberação de lugar e lista de espera,
entregue sobre o projeto base acima. Event storming em [`docs/event-storming.excalidraw`](docs/event-storming.excalidraw)
e glossário da feature em [`docs/linguagem-ubiqua.md`](docs/linguagem-ubiqua.md).

### Como subir

```bash
docker compose up -d
npm ci
npx mikro-orm schema:fresh --run
npm run start:dev      # API principal, porta 3000
npx nest start emails  # app de e-mails, porta 3001
```

### Suíte de testes

```bash
npm test                    # jest --runInBand — obrigatório: a suíte não é segura em paralelo
npm test -- <path do spec>  # roda um spec isolado
npx tsc --noEmit            # 6 erros herdados do projeto base, todos em arquivo de teste (ver Limitações)
```

Depois de rodar `npm test`, rode `npx mikro-orm schema:fresh --run` de novo antes de subir a API — ver
limitação 1 abaixo. A rotina completa e obrigatória, sempre nesta ordem:

```bash
npm test && npx mikro-orm schema:fresh --run
```

`npx tsc --noEmit` sai com 6 erros, todos herdados do projeto base (nenhum introduzido por esta feature),
em 4 arquivos de teste: `apps/emails/test/app.e2e-spec.ts` e `apps/mba-ddd-venda-ingresso/test/app.e2e-spec.ts`
(`supertest` importado como namespace, não como função chamável), e
`apps/mba-ddd-venda-ingresso/src/@core/events/application/order.service.spec.ts` (3 erros — `OrderService`
mudou de assinatura) e `.../domain/entities/__tests__/event.entity.spec.ts` (acesso a campo privado). `tsconfig.app.json`
exclui `test/` e `*.spec.ts`, por isso `npm run build` (que faz type-check) não é afetado.

### Roteiro manual (`api.http`)

Ordem para reproduzir o fluxo completo com o arquivo [`api.http`](api.http) (extensão REST Client):

1. `POST /partners` e 2× `POST /customers` (cliente A e cliente B).
2. `POST /events`, `POST /events/{event_id}/sections` (seção com `total_spots` pequeno, ex.: 1) e
   `PUT /events/{event_id}/publish-all`.
3. `POST /events/{event_id}/orders` pelo cliente A — reserva o único lugar. Observe `status: "PAID"` na resposta.
4. `POST /events/{event_id}/sections/{section_id}/waiting-list` pelo cliente B — agora aceito (a seção está
   esgotada); antes do passo 3 esta mesma chamada responde 500 `Section is not sold out`.
5. `POST /events/{event_id}/orders/{order_id}/cancel` pelo pedido do cliente A.
6. `GET /events/{event_id}/sections/{section_id}/waiting-list` — a entrada do cliente B mudou de
   `"status":"PENDING"` para `"status":"NOTIFIED"`.
7. `GET /events/{event_id}/sections/{section_id}/spots` — o lugar voltou a `"reserved":false`.

Chaves literais a observar em cada resposta: `reserved` (spots), `status` (orders e entradas da fila),
`position` (entradas da fila).

### Modelo

**Fronteira do agregado `WaitingList`.** A lista de espera é um agregado próprio, fora do `Event`, um por
par evento + seção (`WaitingList.event_id` + `WaitingList.section_id`,
`apps/mba-ddd-venda-ingresso/src/@core/events/domain/entities/waiting-list.entity.ts`). As invariantes que
ela protege — um cliente não entra duas vezes enquanto tem entrada `PENDING`, e a promoção da primeira
entrada para `NOTIFIED` — não têm nenhuma leitura ou escrita sobre o estado do `Event` (seção, lugares).
Colocar a fila dentro do `Event` obrigaria carregar e travar o agregado inteiro (incluindo todas as seções
e lugares) só para inserir um cliente na fila de uma seção esgotada, um agregado maior sem nenhum ganho de
consistência transacional — a regra do curso de manter agregados pequenos e desenhados em torno de uma
transação/invariante, quebrada apenas quando a consistência entre as duas partes precisa ser garantida na
mesma transação, o que não é o caso aqui: a fila só reage a um evento (`EventSpotReleased`) publicado pelo
`Event` depois que ele já terminou sua própria transação.

**A cadeia completa do cancelamento.** `OrderCancellationService.cancel` (comando REST
`POST /events/{event_id}/orders/{order_id}/cancel`) roda dentro de `ApplicationService.run(...)` e só
chama `Order.cancel()` — não toca `Event` nem `WaitingList`. O restante acontece por reação, em cascata,
a eventos de domínio:

```
OrderCancelled
  → ReleaseSpotOnOrderCancelledHandler   (localiza o Event pelo spot, libera o lugar, remove a SpotReservation)
    → EventSpotReleased
      → OfferSpotToWaitingCustomerHandler   (carrega a WaitingList da seção, promove a 1ª entrada PENDING)
        → SpotOfferedToWaitingCustomer
          → SpotOfferedToWaitingCustomerIntegrationEvent
            → fila Bull `integration-events` → IntegrationEventsPublisher → RabbitMQ (`amq.direct`)
              → apps/emails / ConsumerService (`@RabbitSubscribe`, queue `emails-waiting-list`) → log
```

| Evento | Arquivo |
|---|---|
| `OrderCancelled` | `apps/mba-ddd-venda-ingresso/src/@core/events/domain/events/domain-events/order-cancelled.event.ts` |
| `EventSpotReleased` | `apps/mba-ddd-venda-ingresso/src/@core/events/domain/events/domain-events/event-spot-released.event.ts` |
| `CustomerJoinedWaitingList` | `apps/mba-ddd-venda-ingresso/src/@core/events/domain/events/domain-events/customer-joined-waiting-list.event.ts` |
| `SpotOfferedToWaitingCustomer` | `apps/mba-ddd-venda-ingresso/src/@core/events/domain/events/domain-events/spot-offered-to-waiting-customer.event.ts` |
| `SpotOfferedToWaitingCustomerIntegrationEvent` | `apps/mba-ddd-venda-ingresso/src/@core/events/domain/events/integration-events/spot-offered-to-waiting-customer.int-events.ts` |

`OrderCancellationService` é um application service separado de `OrderService` (que cria/paga pedidos):
os dois têm ciclos de vida e dependências diferentes (o primeiro só depende do repositório de `Order` e do
`ApplicationService`; o segundo depende também de `Event`, `SpotReservation` e do `PaymentGateway`), e
juntar os dois numa única classe misturaria o caminho de criação (com pagamento e Unit of Work cru) com o
de cancelamento (reação por eventos via `ApplicationService.run`) sem nenhum benefício de coesão.

### Rotas novas

| Método | Path | Body | Resposta (2xx) | Erros |
|---|---|---|---|---|
| `POST` | `/events/:event_id/orders/:order_id/cancel` | — | `Order` com `status: "CANCELLED"` | `Order not found`, `Order already cancelled` |
| `POST` | `/events/:event_id/sections/:section_id/waiting-list` | `{ "customer_id": string }` | `WaitingList` (agregado, com `entries`) | `Customer not found`, `Event not found`, `Section not found`, `Section is not sold out`, `Customer already in waiting list` |
| `GET` | `/events/:event_id/sections/:section_id/waiting-list` | — | array de entradas: `{ id, customer_id, status, position }` | — |

A coluna "Erros" lista a mensagem de domínio real de cada `Error` lançado, mas ela **não** chega ao
cliente — ver limitação 2: a resposta HTTP é sempre `{"statusCode":500,"message":"Internal server error"}`,
genérica. A mensagem de domínio só é visível do lado do servidor, no log (`ExceptionsHandler] <mensagem>`).

### Limitações e decisões

1. **A suíte derruba a tabela `stored_event`.** Cada spec de infraestrutura chama
   `orm.schema.refreshDatabase()` com a lista de `entities` da sua própria `MikroORM.init()`, e nenhum
   registra `StoredEventSchema`
   (`apps/mba-ddd-venda-ingresso/src/@core/events/infra/db/repositories/__tests__/waiting-list-mysql.repository.spec.ts:43`).
   Rodar a suíte apaga a tabela; por isso a rotina obrigatória é sempre `npm test && npx mikro-orm schema:fresh --run`,
   nunca só `npm test`.
2. **Erro de domínio vira HTTP 500, com corpo genérico.** Não há filtro de exceção customizado registrado
   (`apps/mba-ddd-venda-ingresso/src/main.ts`) mapeando `Error` de domínio para um código HTTP mais
   específico (400/404/409); o filtro padrão do Nest devolve sempre
   `{"statusCode":500,"message":"Internal server error"}` no corpo, medido ao vivo em três chamadas de
   erro (fila antes de esgotar, entrada duplicada, cancelamento repetido). A mensagem real (`Section is
   not sold out`, `Customer already in waiting list`, `Order already cancelled`, etc.) só aparece no log
   do servidor, como `ExceptionsHandler] <mensagem>`.
3. **`mikro-orm.config.ts` e `DatabaseModule` divergem em configuração** (herdado do projeto base):
   `apps/mba-ddd-venda-ingresso/src/mikro-orm.config.ts` (usado pela CLI, ex. `schema:fresh`) não define
   `port` nem `forceEntityConstructor`, enquanto
   `apps/mba-ddd-venda-ingresso/src/database/database.module.ts:36,40` (usado pela API em runtime) define
   `port: 3306` e `forceEntityConstructor: true`. Sem efeito observado nesta entrega porque 3306 é a porta
   padrão do MySQL, mas os dois arquivos podem divergir mais no futuro.
4. **`EventSpotReleased.aggregate_id` é o `event_id`, não o `section_id` nem o `spot_id`** — decisão de
   modelagem para que o handler de reação localize a `WaitingList` por evento + seção
   (`apps/mba-ddd-venda-ingresso/src/@core/events/domain/entities/event.entity.ts:242`).
5. **O typo `EventMarkedSportAsReserved` (Sport em vez de Spot) foi mantido**, por já existir no projeto
   base antes desta feature
   (`apps/mba-ddd-venda-ingresso/src/@core/events/domain/events/domain-events/event-marked-sport-as-reserved.event.ts:6`) —
   corrigir o nome quebraria compatibilidade com o `type_name` já gravado em `stored_event` por entregas
   anteriores, sem necessidade para esta feature.
6. **`EventSection.isSoldOut()` de uma seção com 0 lugares retorna `true`**
   (`apps/mba-ddd-venda-ingresso/src/@core/events/domain/entities/event-section.ts:146-148`, `.every()`
   sobre coleção vazia) — vácuo lógico esperado do `Array.prototype.every`, não tratado como caso especial
   porque o fluxo de criação de seção não permite `total_spots: 0` para conseguir gerar essa entrada.
7. **A rota de cancelamento é aninhada em `:event_id`, mas nada valida que o pedido pertence àquele
   evento** — `Order` não modela `event_id`, só `event_spot_id`
   (`apps/mba-ddd-venda-ingresso/src/@core/events/domain/entities/order.entity.ts:21`); o `event_id` da
   rota chega ao `OrderCancellationService.cancel` e não é usado
   (`apps/mba-ddd-venda-ingresso/src/@core/events/application/order-cancellation.service.ts:10-11`, comentário
   no próprio código) nem ao `OrdersController.cancel`
   (`apps/mba-ddd-venda-ingresso/src/events/orders/orders.controller.ts:35-40`).
8. **`ApplicationService.finish()` publica só o agregado do snapshot inicial** — `getAggregateRoots()` é
   lido uma vez, antes de qualquer `publish()`
   (`apps/mba-ddd-venda-ingresso/src/@core/common/application/application.service.ts:14-21`). Os agregados
   que os handlers carregam/criam durante a cascata (o `Event` recarregado, a `WaitingList`) não entram
   nesse snapshot; por isso cada handler publica os eventos do seu próprio agregado explicitamente — o
   `OfferSpotToWaitingCustomerHandler` chama `publish(waitingList)` e, na sequência,
   `publishForIntegrationEvent(waitingList)`
   (`apps/mba-ddd-venda-ingresso/src/@core/events/application/handlers/offer-spot-to-waiting-customer.handler.ts:32,35`)
   — note que aqui o evento de integração sai **antes** do `uow.commit()` do `ApplicationService` (que só
   acontece de volta na pilha, no `finish()` do comando original), diferente do caminho normal em que
   `commit()` vem antes da integração.
9. **`event_id`/`section_id` da `WaitingList` chegam como string crua na hidratação do MikroORM**, não
   como value object — efeito de `reference: 'm:1', mapToPk: true`
   (`apps/mba-ddd-venda-ingresso/src/@core/events/infra/db/schemas.ts:210,215`). O
   `SpotOfferedToWaitingCustomerIntegrationEvent` usa uma função `idValue()` na fronteira para aceitar os
   dois formatos (string ou value object) sem alargar o tipo declarado no domínio
   (`apps/mba-ddd-venda-ingresso/src/@core/events/domain/events/integration-events/spot-offered-to-waiting-customer.int-events.ts:8-10`).

### Como verificar pelo banco

```sql
SELECT is_reserved FROM event_spot;                                 -- 0 (false) após o cancelamento
SELECT COUNT(*) FROM spot_reservation;                               -- 0 — a reserva foi removida
SELECT type_name, COUNT(*) FROM stored_event GROUP BY type_name ORDER BY type_name;
-- CustomerJoinedWaitingList, EventSpotReleased, OrderCancelled, PartnerCreated, SpotOfferedToWaitingCustomer — 1 cada
```

## Professor

<a href="https://github.com/argentinaluiz">
    <img src="https://avatars.githubusercontent.com/u/4926329?v=4?s=100" width="100px;" alt=""/>
    <br />
    <sub>
        <b>Luiz Carlos</b>
    </sub>
</a>
