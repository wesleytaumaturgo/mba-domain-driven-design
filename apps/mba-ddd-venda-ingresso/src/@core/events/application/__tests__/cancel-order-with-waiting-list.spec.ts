import { MikroORM, MySqlDriver } from '@mikro-orm/mysql';
import {
  CustomerSchema,
  EventSchema,
  EventSectionSchema,
  EventSpotSchema,
  OrderSchema,
  PartnerSchema,
  SpotReservationSchema,
  WaitingListSchema,
  WaitingListEntrySchema,
} from '../../infra/db/schemas';
import { CustomerMysqlRepository } from '../../infra/db/repositories/customer-mysql.repository';
import { PartnerMysqlRepository } from '../../infra/db/repositories/partner-mysql.repository';
import { EventMysqlRepository } from '../../infra/db/repositories/event-mysql.repository';
import { OrderMysqlRepository } from '../../infra/db/repositories/order-mysql.repository';
import { SpotReservationMysqlRepository } from '../../infra/db/repositories/spot-reservation-mysql.repository';
import { WaitingListMysqlRepository } from '../../infra/db/repositories/waiting-list-mysql.repository';
import { UnitOfWorkMikroOrm } from '../../../common/infra/unit-of-work-mikro-orm';
import { ApplicationService } from '../../../common/application/application.service';
import { DomainEventManager } from '../../../common/domain/domain-event-manager';
import { Customer } from '../../domain/entities/customer.entity';
import { Partner } from '../../domain/entities/partner.entity';
import { Order } from '../../domain/entities/order.entity';
import { SpotReservation } from '../../domain/entities/spot-reservation.entity';
import { WaitingListEntryStatus } from '../../domain/entities/waiting-list-entry';
import { OrderCancellationService } from '../order-cancellation.service';
import { WaitingListService } from '../waiting-list.service';
import { ReleaseSpotOnOrderCancelledHandler } from '../handlers/release-spot-on-order-cancelled.handler';
import { OfferSpotToWaitingCustomerHandler } from '../handlers/offer-spot-to-waiting-customer.handler';
import { SpotOfferedToWaitingCustomer } from '../../domain/events/domain-events/spot-offered-to-waiting-customer.event';
import { SpotOfferedToWaitingCustomerIntegrationEvent } from '../../domain/events/integration-events/spot-offered-to-waiting-customer.int-events';

let orm: Awaited<ReturnType<typeof MikroORM.init<MySqlDriver>>>;

beforeEach(async () => {
  orm = await MikroORM.init<MySqlDriver>({
    entities: [
      PartnerSchema,
      CustomerSchema,
      EventSchema,
      EventSectionSchema,
      EventSpotSchema,
      OrderSchema,
      SpotReservationSchema,
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

async function montarContexto() {
  const em = orm.em.fork();
  const partnerRepo = new PartnerMysqlRepository(em);
  const customerRepo = new CustomerMysqlRepository(em);
  const eventRepo = new EventMysqlRepository(em);
  const orderRepo = new OrderMysqlRepository(em);
  const spotReservationRepo = new SpotReservationMysqlRepository(em);
  const waitingListRepo = new WaitingListMysqlRepository(em);
  const uow = new UnitOfWorkMikroOrm(em);
  const domainEventManager = new DomainEventManager();
  const applicationService = new ApplicationService(uow, domainEventManager);

  const releaseSpotHandler = new ReleaseSpotOnOrderCancelledHandler(
    eventRepo,
    spotReservationRepo,
    domainEventManager,
  );
  const offerSpotHandler = new OfferSpotToWaitingCustomerHandler(
    waitingListRepo,
    domainEventManager,
  );

  ReleaseSpotOnOrderCancelledHandler.listensTo().forEach((eventName) => {
    domainEventManager.register(eventName, (event) =>
      releaseSpotHandler.handle(event),
    );
  });
  OfferSpotToWaitingCustomerHandler.listensTo().forEach((eventName) => {
    domainEventManager.register(eventName, (event) =>
      offerSpotHandler.handle(event),
    );
  });

  const integrationSpy = jest.fn();
  domainEventManager.registerForIntegrationEvent(
    SpotOfferedToWaitingCustomer.name,
    async (event: SpotOfferedToWaitingCustomer) => {
      integrationSpy(new SpotOfferedToWaitingCustomerIntegrationEvent(event));
    },
  );

  const orderCancellationService = new OrderCancellationService(
    orderRepo,
    applicationService,
  );
  const waitingListService = new WaitingListService(
    waitingListRepo,
    eventRepo,
    customerRepo,
    applicationService,
  );

  const partner = Partner.create({ name: 'Partner 1' });
  await partnerRepo.add(partner);

  const customerA = Customer.create({ name: 'Customer A', cpf: '70375887091' });
  const customerB = Customer.create({ name: 'Customer B', cpf: '99346413050' });
  await customerRepo.add(customerA);
  await customerRepo.add(customerB);

  const event = partner.initEvent({
    name: 'Event 1',
    description: 'Event 1',
    date: new Date(),
  });
  event.addSection({
    name: 'Section 1',
    description: 'Section 1',
    price: 100,
    total_spots: 1,
  });
  event.publishAll();
  await eventRepo.add(event);

  await uow.commit();

  const section = event.sections.values()[0];
  const spot = section.spots.values()[0];

  return {
    em,
    uow,
    integrationSpy,
    orderCancellationService,
    waitingListService,
    orderRepo,
    eventRepo,
    spotReservationRepo,
    waitingListRepo,
    customerA,
    customerB,
    event,
    section,
    spot,
  };
}

type Contexto = Awaited<ReturnType<typeof montarContexto>>;

async function comprarIngresso(ctx: Contexto) {
  ctx.event.markSpotAsReserved({
    section_id: ctx.section.id,
    spot_id: ctx.spot.id,
  });

  const spotReservation = SpotReservation.create({
    spot_id: ctx.spot.id,
    customer_id: ctx.customerA.id,
  });
  await ctx.spotReservationRepo.add(spotReservation);

  const order = Order.create({
    customer_id: ctx.customerA.id,
    event_spot_id: ctx.spot.id,
    amount: ctx.section.price,
  });
  order.pay();
  await ctx.orderRepo.add(order);
  await ctx.eventRepo.add(ctx.event);

  await ctx.uow.commit();

  return order;
}

it('não aceita entrada na fila enquanto a seção não está esgotada', async () => {
  const ctx = await montarContexto();

  await expect(
    ctx.waitingListService.join({
      event_id: ctx.event.id.value,
      section_id: ctx.section.id.value,
      customer_id: ctx.customerB.id.value,
    }),
  ).rejects.toThrow('Section is not sold out');
});

describe('cancelamento do pedido libera o lugar e notifica a fila', () => {
  let ctx: Contexto;
  let order: Order;

  beforeEach(async () => {
    ctx = await montarContexto();
    order = await comprarIngresso(ctx);

    await ctx.waitingListService.join({
      event_id: ctx.event.id.value,
      section_id: ctx.section.id.value,
      customer_id: ctx.customerB.id.value,
    });

    // força a fila e o agregado Event a serem recarregados do banco pelos
    // handlers (não reaproveitados da identity map montada nesta fixture) —
    // é essa hidratação que expõe event_id/section_id como string (8.2-b)
    ctx.em.clear();

    await ctx.orderCancellationService.cancel({
      event_id: ctx.event.id.value,
      order_id: order.id.value,
    });
  });

  it('cancelar o pedido libera o lugar, remove a reserva e notifica o primeiro da fila', async () => {
    const eventoRecarregado = await ctx.eventRepo.findByEventSpotId(
      ctx.spot.id,
    );
    const spotRecarregado = eventoRecarregado.sections
      .values()[0]
      .spots.values()[0];
    expect(spotRecarregado.is_reserved).toBe(false);

    const reservaRecarregada = await ctx.spotReservationRepo.findById(
      ctx.spot.id,
    );
    expect(reservaRecarregada).toBeNull();

    const filaRecarregada = await ctx.waitingListRepo.findByEventAndSection(
      ctx.event.id,
      ctx.section.id,
    );
    const entradaB = filaRecarregada.entries
      .values()
      .find((entry) => entry.customer_id.equals(ctx.customerB.id));
    expect(entradaB.status).toBe(WaitingListEntryStatus.NOTIFIED);
  });

  it('emite o evento de integração com payload completo a partir da fila recarregada do banco', () => {
    expect(ctx.integrationSpy).toHaveBeenCalledTimes(1);

    const integrationEvent = ctx.integrationSpy.mock.calls[0][0];
    expect(integrationEvent.payload).toEqual({
      customer_id: ctx.customerB.id.value,
      event_id: ctx.event.id.value,
      section_id: ctx.section.id.value,
      spot_id: ctx.spot.id.value,
    });
  });

  it('segundo cancelamento do mesmo pedido é rejeitado', async () => {
    await expect(
      ctx.orderCancellationService.cancel({
        event_id: ctx.event.id.value,
        order_id: order.id.value,
      }),
    ).rejects.toThrow('Order already cancelled');

    expect(ctx.integrationSpy).toHaveBeenCalledTimes(1);
  });
});
