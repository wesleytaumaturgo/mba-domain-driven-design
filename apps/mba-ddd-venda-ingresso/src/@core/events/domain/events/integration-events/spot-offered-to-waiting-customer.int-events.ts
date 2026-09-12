import { IIntegrationEvent } from '../../../../common/domain/integration-event';
import { SpotOfferedToWaitingCustomer } from '../domain-events/spot-offered-to-waiting-customer.event';

// MikroORM hidrata campos `reference: 'm:1', mapToPk: true` (event_id/section_id em
// WaitingList, ver *.schema-type.ts "não funciona para relacionamentos") como string
// crua, não como o value object — por isso a extração aceita os dois formatos aqui,
// na fronteira do evento de integração, sem alargar o tipo declarado no domínio.
function idValue(id: { value: string } | string): string {
  return typeof id === 'string' ? id : id.value;
}

export class SpotOfferedToWaitingCustomerIntegrationEvent
  implements IIntegrationEvent
{
  event_name: string;
  payload: any;
  event_version: number;
  occurred_on: Date;

  constructor(domainEvent: SpotOfferedToWaitingCustomer) {
    this.event_name = SpotOfferedToWaitingCustomerIntegrationEvent.name;
    this.payload = {
      customer_id: idValue(domainEvent.customer_id),
      event_id: idValue(domainEvent.event_id),
      section_id: idValue(domainEvent.section_id),
      spot_id: idValue(domainEvent.spot_id),
    };
    this.event_version = 1;
    this.occurred_on = domainEvent.occurred_on;
  }
}
