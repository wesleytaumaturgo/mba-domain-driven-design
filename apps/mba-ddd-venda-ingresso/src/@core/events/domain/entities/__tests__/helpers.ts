import { EntitySchema, MikroORM } from '@mikro-orm/core';
import {
  CustomerSchema,
  EventSchema,
  EventSectionSchema,
  EventSpotSchema,
  OrderSchema,
  PartnerSchema,
  SpotReservationSchema,
} from '../../../infra/db/schemas';
import { WaitingList } from '../waiting-list.entity';
import { WaitingListEntry } from '../waiting-list-entry';

// Fixture de metadados. O MikroORM exige metadados da entidade para que
// MyCollectionFactory/Collection.add funcione, mesmo sem conexão. O EntitySchema
// definitivo da WaitingList é da camada de infraestrutura; enquanto ele não
// existe, estes dois schemas mínimos servem só aos testes de domínio.
const WaitingListSchemaFixture = new EntitySchema<WaitingList>({
  class: WaitingList,
  properties: {
    id: { type: 'string', primary: true },
    event_id: { type: 'string' },
    section_id: { type: 'string' },
    entries: {
      reference: '1:m',
      entity: () => WaitingListEntry,
      mappedBy: (entry) => entry.waiting_list_id,
    },
  },
});

const WaitingListEntrySchemaFixture = new EntitySchema<WaitingListEntry>({
  class: WaitingListEntry,
  properties: {
    id: { type: 'string', primary: true },
    customer_id: { type: 'string' },
    status: { type: 'number' },
    position: { type: 'number' },
    waiting_list_id: {
      reference: 'm:1',
      entity: () => WaitingList,
      mapToPk: true,
      type: 'string',
    },
  },
});

export function initOrm() {
  beforeAll(async () => {
    await MikroORM.init(
      {
        allowGlobalContext: true,
        entities: [
          PartnerSchema,
          CustomerSchema,
          EventSchema,
          EventSectionSchema,
          EventSpotSchema,
          OrderSchema,
          SpotReservationSchema,
          WaitingListSchemaFixture,
          WaitingListEntrySchemaFixture,
        ],
        type: 'mysql',
        dbName: 'fake',
      },
      false,
    );
  });
}
