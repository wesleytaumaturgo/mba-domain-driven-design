import { IDomainEventHandler } from '../../../common/application/domain-event-handler.interface';
import { DomainEventManager } from '../../../common/domain/domain-event-manager';
import { EventSpotReleased } from '../../domain/events/domain-events/event-spot-released.event';
import { IWaitingListRepository } from '../../domain/repositories/waiting-list-repository.interface';

export class OfferSpotToWaitingCustomerHandler implements IDomainEventHandler {
  constructor(
    private waitingListRepo: IWaitingListRepository,
    private domainEventManager: DomainEventManager,
  ) {}

  async handle(event: EventSpotReleased): Promise<void> {
    // `aggregate_id` do EventSpotReleased é o event_id
    const waitingList = await this.waitingListRepo.findByEventAndSection(
      event.aggregate_id,
      event.section_id,
    );

    // sem fila naquela seção a reação termina sem efeito e sem erro
    if (!waitingList) {
      return;
    }

    const entry = waitingList.offerSpotToNext({ spot_id: event.spot_id });

    // fila sem entrada pendente: nada a notificar
    if (!entry) {
      return;
    }

    await this.waitingListRepo.add(waitingList);
    await this.domainEventManager.publish(waitingList);
    // snapshot único de aggregateRoots em application.service.ts:14 não alcança agregado
    // adicionado dentro da cascata de handlers — publica aqui, igual ao publish() acima
    await this.domainEventManager.publishForIntegrationEvent(waitingList);
  }

  static listensTo(): string[] {
    return [EventSpotReleased.name];
  }
}
