import { MikroORM, MySqlDriver } from '@mikro-orm/mysql';
import {
  EventSchema,
  EventSectionSchema,
  EventSpotSchema,
  PartnerSchema,
} from '../../schemas';
import { Event } from '../../../../domain/entities/event.entity';
import { EventSpotId } from '../../../../domain/entities/event-spot';
import { EventMysqlRepository } from '../event-mysql.repository';
import { Partner } from '../../../../domain/entities/partner.entity';
import { PartnerMysqlRepository } from '../partner-mysql.repository';

test('Event repository', async () => {
  const orm = await MikroORM.init<MySqlDriver>({
    entities: [EventSchema, EventSectionSchema, EventSpotSchema, PartnerSchema],
    dbName: 'events',
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'root',
    type: 'mysql',
    forceEntityConstructor: true,
    debug: true,
  });
  await orm.schema.refreshDatabase();
  const em = orm.em.fork();
  const partnerRepo = new PartnerMysqlRepository(em);
  const eventRepo = new EventMysqlRepository(em);

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
    total_spots: 1000,
  });

  await eventRepo.add(event);
  await em.flush();
  await em.clear();

  const eventFound = await eventRepo.findById(event.id);
  console.log(eventFound);

  await orm.close();
});

test('findByEventSpotId devolve o evento inteiro a partir do spot', async () => {
  const orm = await MikroORM.init<MySqlDriver>({
    entities: [EventSchema, EventSectionSchema, EventSpotSchema, PartnerSchema],
    dbName: 'events',
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'root',
    type: 'mysql',
    forceEntityConstructor: true,
  });
  await orm.schema.refreshDatabase();
  const em = orm.em.fork();
  const partnerRepo = new PartnerMysqlRepository(em);
  const eventRepo = new EventMysqlRepository(em);

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
  event.addSection({
    name: 'Section 2',
    description: 'Section 2 description',
    price: 200,
    total_spots: 3,
  });
  await eventRepo.add(event);
  await em.flush();
  await em.clear();

  const [, segundaSecao] = event.sections;
  const [, spotAlvo] = segundaSecao.spots.values();

  const encontrado = await eventRepo.findByEventSpotId(spotAlvo.id);

  expect(encontrado).not.toBeNull();
  expect(encontrado.id.value).toBe(event.id.value);

  // o agregado vem inteiro: as DUAS seções e todos os lugares de cada uma
  expect(encontrado.sections.size).toBe(2);
  const totalDeLugares = encontrado.sections
    .values()
    .reduce((acc, s) => acc + s.spots.size, 0);
  expect(totalDeLugares).toBe(5);

  const secaoDoSpot = encontrado.sections.find(
    (s) => s.spots.find((spot) => spot.id.equals(spotAlvo.id)) !== undefined,
  );
  expect(secaoDoSpot).toBeDefined();
  expect(secaoDoSpot.id.value).toBe(segundaSecao.id.value);

  await orm.close();
});

test('findByEventSpotId devolve null para um spot inexistente', async () => {
  const orm = await MikroORM.init<MySqlDriver>({
    entities: [EventSchema, EventSectionSchema, EventSpotSchema, PartnerSchema],
    dbName: 'events',
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'root',
    type: 'mysql',
    forceEntityConstructor: true,
  });
  await orm.schema.refreshDatabase();
  const em = orm.em.fork();
  const eventRepo = new EventMysqlRepository(em);

  const encontrado = await eventRepo.findByEventSpotId(new EventSpotId());

  expect(encontrado).toBeNull();

  await orm.close();
});
