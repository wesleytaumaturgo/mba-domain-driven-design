import { MikroORM, MySqlDriver } from '@mikro-orm/mysql';
import {
  CustomerSchema,
  EventSchema,
  EventSectionSchema,
  EventSpotSchema,
  PartnerSchema,
  WaitingListEntrySchema,
  WaitingListSchema,
} from '../../schemas';
import { Customer } from '../../../../domain/entities/customer.entity';
import { Partner } from '../../../../domain/entities/partner.entity';
import { WaitingList } from '../../../../domain/entities/waiting-list.entity';
import { WaitingListEntryStatus } from '../../../../domain/entities/waiting-list-entry';
import { EventSectionId } from '../../../../domain/entities/event-section';
import { EventId } from '../../../../domain/entities/event.entity';
import { CustomerMysqlRepository } from '../customer-mysql.repository';
import { PartnerMysqlRepository } from '../partner-mysql.repository';
import { EventMysqlRepository } from '../event-mysql.repository';
import { WaitingListMysqlRepository } from '../waiting-list-mysql.repository';

let orm: Awaited<ReturnType<typeof MikroORM.init<MySqlDriver>>>;

beforeEach(async () => {
  orm = await MikroORM.init<MySqlDriver>({
    entities: [
      PartnerSchema,
      CustomerSchema,
      EventSchema,
      EventSectionSchema,
      EventSpotSchema,
      WaitingListSchema,
      WaitingListEntrySchema,
    ],
    dbName: 'events',
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'root',
    type: 'mysql',
    forceEntityConstructor: true,
  });
  await orm.schema.refreshDatabase();
});

afterEach(async () => {
  await orm.close();
});

async function cenario() {
  const em = orm.em.fork();
  const partnerRepo = new PartnerMysqlRepository(em);
  const customerRepo = new CustomerMysqlRepository(em);
  const eventRepo = new EventMysqlRepository(em);
  const waitingListRepo = new WaitingListMysqlRepository(em);

  const partner = Partner.create({ name: 'Partner 1' });
  await partnerRepo.add(partner);

  const event = partner.initEvent({
    name: 'Event 1',
    date: new Date(),
    description: 'Event 1 description',
  });
  event.addSection({
    name: 'Section 1',
    description: 'Section 1 description',
    price: 100,
    total_spots: 2,
  });
  event.publishAll();
  await eventRepo.add(event);

  const [section] = event.sections;

  const customers = [] as Customer[];
  for (const [i, cpf] of [
    '59211087074',
    '52998224725',
    '15350946056',
    '40532176871',
  ].entries()) {
    const customer = Customer.create({ name: `Customer ${i + 1}`, cpf });
    await customerRepo.add(customer);
    customers.push(customer);
  }

  await em.flush();

  return { em, waitingListRepo, event, section, customers };
}

test('deve persistir a fila e recarregá-la na ordem de chegada', async () => {
  const { em, waitingListRepo, event, section, customers } = await cenario();

  const waitingList = WaitingList.create({
    event_id: event.id,
    section_id: section.id,
  });

  // entra na ordem 1, 2, 3 — mas os registros são gravados fora de ordem
  const primeira = waitingList.join({ customer_id: customers[0].id });
  const segunda = waitingList.join({ customer_id: customers[1].id });
  const terceira = waitingList.join({ customer_id: customers[2].id });

  expect([primeira.position, segunda.position, terceira.position]).toEqual([
    1, 2, 3,
  ]);

  // grava as entradas em ordem invertida de posição (3, 1, 2)
  em.persist([terceira, primeira, segunda]);
  await waitingListRepo.add(waitingList);
  await em.flush();
  await em.clear();

  const encontrada = await waitingListRepo.findByEventAndSection(
    event.id,
    section.id,
  );

  expect(encontrada).not.toBeNull();
  expect(encontrada.entries.size).toBe(3);
  expect(encontrada.entries.values().map((e) => e.position)).toEqual([1, 2, 3]);
  expect(encontrada.entries.values().map((e) => e.customer_id.value)).toEqual([
    customers[0].id.value,
    customers[1].id.value,
    customers[2].id.value,
  ]);
});

test('findByEventAndSection devolve null para par inexistente', async () => {
  const { waitingListRepo } = await cenario();

  const encontrada = await waitingListRepo.findByEventAndSection(
    new EventId(),
    new EventSectionId(),
  );

  expect(encontrada).toBeNull();
});

test('lista recarregada calcula a próxima posição a partir das entradas do banco', async () => {
  const { em, waitingListRepo, event, section, customers } = await cenario();

  const waitingList = WaitingList.create({
    event_id: event.id,
    section_id: section.id,
  });
  waitingList.join({ customer_id: customers[0].id });
  waitingList.join({ customer_id: customers[1].id });
  waitingList.join({ customer_id: customers[2].id });
  await waitingListRepo.add(waitingList);
  await em.flush();
  await em.clear();

  const recarregada = await waitingListRepo.findByEventAndSection(
    event.id,
    section.id,
  );
  const quarta = recarregada.join({ customer_id: customers[3].id });

  expect(quarta.position).toBe(4);

  await em.flush();
  await em.clear();

  const final = await waitingListRepo.findByEventAndSection(
    event.id,
    section.id,
  );
  expect(final.entries.size).toBe(4);
  expect(final.entries.values().map((e) => e.position)).toEqual([1, 2, 3, 4]);
});

test('o status NOTIFIED sobrevive ao round-trip', async () => {
  const { em, waitingListRepo, event, section, customers } = await cenario();

  const waitingList = WaitingList.create({
    event_id: event.id,
    section_id: section.id,
  });
  waitingList.join({ customer_id: customers[0].id });
  waitingList.join({ customer_id: customers[1].id });
  const promovida = waitingList.offerSpotToNext({
    spot_id: section.spots.values()[0].id,
  });
  await waitingListRepo.add(waitingList);
  await em.flush();
  await em.clear();

  const recarregada = await waitingListRepo.findByEventAndSection(
    event.id,
    section.id,
  );
  const [primeira, segunda] = recarregada.entries.values();

  expect(primeira.id.value).toBe(promovida.id.value);
  expect(primeira.status).toBe(WaitingListEntryStatus.NOTIFIED);
  expect(primeira.isPending()).toBe(false);
  expect(segunda.status).toBe(WaitingListEntryStatus.PENDING);
});
