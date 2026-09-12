# Linguagem ubíqua — Lista de espera de ingressos

Glossário da feature. Os nomes desta tabela são os mesmos que aparecem no código: quando um termo
ainda não existe no repositório, o identificador vai marcado com `(novo)`.

| Termo | Definição | No código |
|---|---|---|
| **Lista de espera** | Fila de clientes interessados em uma seção esgotada de um evento. Existe uma lista por par evento + seção, criada quando o primeiro cliente entra. | `WaitingList` `(novo)`, identificada por `WaitingListId` `(novo)` mais `event_id` + `section_id` |
| **Entrada** | O registro de um cliente dentro de uma lista de espera: quem é, em que posição chegou e em que estado está. É entidade filha da lista, nunca um agregado próprio. | `WaitingListEntry` `(novo)`, `WaitingListEntryId` `(novo)` |
| **Pendente** | Estado inicial de uma entrada: o cliente está na fila e ainda não foi avisado de nenhuma vaga. | `WaitingListEntryStatus.PENDING` `(novo)` |
| **Notificada** | Estado de uma entrada já avisada de que abriu uma vaga. Uma entrada notificada não é notificada de novo. | `WaitingListEntryStatus.NOTIFIED` `(novo)` |
| **Ordem de chegada** | Critério que define quem é o primeiro da fila: a posição atribuída pela lista no momento em que o cliente entra, estável mesmo que outras entradas mudem de estado. | `WaitingListEntry.position` `(novo)`; `orderBy: { position: 'ASC' }` no `WaitingListEntrySchema` `(novo)` |
| **Seção esgotada** | Seção em que nenhum lugar está disponível para reserva. É a condição para entrar na lista de espera, e é derivada da disponibilidade dos lugares, não de contador. | `EventSection.isSoldOut()` `(novo)`, sobre `allowReserveSpot` |
| **Cancelamento de pedido** | Ato de um cliente desistir de um pedido já feito. O pedido passa a `CANCELLED` e registra o fato; o cancelamento não devolve o lugar nem mexe na fila. | `Order.cancel()`, `OrderCancelled`, `OrderCancellationService` `(novo)` |
| **Liberação de lugar** | Consequência do cancelamento: o lugar deixa de estar reservado e volta a ficar disponível para compra. Nasce no agregado `Event`, que localiza a seção dona do lugar. | `Event.markSpotAsAvailable()` `(novo)` → `EventSection.markSpotAsAvailable()` `(novo)` → `EventSpot.markAsAvailable()` `(novo)`; evento `EventSpotReleased` `(novo)` |
| **Trava de reserva** | Registro que impede que o mesmo lugar seja vendido duas vezes, identificado pelo próprio lugar. Ao liberar o lugar, a trava é removida. | `SpotReservation`, `is_reserved` |
| **Oferta de lugar** | Aviso ao primeiro cliente pendente da fila de que abriu uma vaga na seção. É só um aviso: não reserva, não dá prioridade e não expira. | `WaitingList.offerSpotToNext()` `(novo)`, evento `SpotOfferedToWaitingCustomer` `(novo)` |
| **Política de notificação** | A regra que liga as duas pontas: quando um lugar é liberado, o primeiro pendente da fila daquela seção é notificado. Vive em um handler, nunca dentro de um comando. | `OfferSpotToWaitingCustomerHandler` `(novo)`, reagindo a `EventSpotReleased` `(novo)` |
| **Evento de domínio** | Fato consumado dentro do sistema, registrado pelo agregado que o causou e publicado para quem quiser reagir. Fica gravado na tabela de stored events. | `IDomainEvent`, `DomainEventManager.publish`, tabela `stored_event` |
| **Evento de integração** | Tradução de um evento de domínio para fora da fronteira do sistema, com payload próprio, que atravessa a fila e o RabbitMQ até outro contexto. | `SpotOfferedToWaitingCustomerIntegrationEvent` `(novo)`, `IIntegrationEvent` |
| **Contexto de e-mails** | Aplicação separada do monorepo que consome eventos de integração e avisa o cliente. Nesta feature ela apenas registra o aviso em log. | `apps/emails`, `ConsumerService` com `@RabbitSubscribe` |

## Correspondência com o enunciado

Os quatro erros de negócio da feature usam exatamente estes termos:
`Order not found` e `Order already cancelled` (cancelamento de pedido), `Section is not sold out`
(seção esgotada) e `Customer already in waiting list` (entrada duplicada, estado pendente).
