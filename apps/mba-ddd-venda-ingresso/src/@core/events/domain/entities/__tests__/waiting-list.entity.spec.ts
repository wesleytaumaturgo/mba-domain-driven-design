import { CustomerId } from '../customer.entity';
import { EventSectionId } from '../event-section';
import { EventSpotId } from '../event-spot';
import { EventId } from '../event.entity';
import { WaitingListEntryStatus } from '../waiting-list-entry';
import { WaitingList } from '../waiting-list.entity';
import { initOrm } from './helpers';

function makeWaitingList() {
  return WaitingList.create({
    event_id: new EventId(),
    section_id: new EventSectionId(),
  });
}

function eventosDoTipo(waitingList: WaitingList, nome: string) {
  return [...waitingList.events].filter((e) => e.constructor.name === nome);
}

describe('WaitingList Entity Unit Tests', () => {
  initOrm();

  test('1. join registra uma entrada PENDING na posição 1 e o CustomerJoinedWaitingList', () => {
    const waitingList = makeWaitingList();
    const customer_id = new CustomerId();

    const entry = waitingList.join({ customer_id });

    expect(waitingList.entries.size).toBe(1);
    expect(entry.status).toBe(WaitingListEntryStatus.PENDING);
    expect(entry.position).toBe(1);
    expect(entry.customer_id.equals(customer_id)).toBe(true);

    const [evento] = eventosDoTipo(waitingList, 'CustomerJoinedWaitingList');
    expect(evento).toBeDefined();
    expect((evento as any).aggregate_id.equals(waitingList.id)).toBe(true);
    expect((evento as any).entry_id.equals(entry.id)).toBe(true);
    expect((evento as any).customer_id.equals(customer_id)).toBe(true);
    expect((evento as any).event_id.equals(waitingList.event_id)).toBe(true);
    expect((evento as any).section_id.equals(waitingList.section_id)).toBe(
      true,
    );
    expect((evento as any).position).toBe(1);
  });

  test('2. join do mesmo cliente com entrada PENDING lança Customer already in waiting list', () => {
    const waitingList = makeWaitingList();
    const customer_id = new CustomerId();

    waitingList.join({ customer_id });

    expect(() => waitingList.join({ customer_id })).toThrow(
      'Customer already in waiting list',
    );
    expect(waitingList.entries.size).toBe(1);
  });

  test('3. offerSpotToNext promove a primeira entrada e registra o SpotOfferedToWaitingCustomer', () => {
    const waitingList = makeWaitingList();
    const primeiro = new CustomerId();
    const segundo = new CustomerId();
    const spot_id = new EventSpotId();

    const entradaDoPrimeiro = waitingList.join({ customer_id: primeiro });
    waitingList.join({ customer_id: segundo });

    const promovida = waitingList.offerSpotToNext({ spot_id });

    expect(promovida.id.equals(entradaDoPrimeiro.id)).toBe(true);
    expect(promovida.status).toBe(WaitingListEntryStatus.NOTIFIED);
    expect(promovida.position).toBe(1);

    const [evento] = eventosDoTipo(waitingList, 'SpotOfferedToWaitingCustomer');
    expect((evento as any).aggregate_id.equals(waitingList.id)).toBe(true);
    expect((evento as any).entry_id.equals(entradaDoPrimeiro.id)).toBe(true);
    expect((evento as any).customer_id.equals(primeiro)).toBe(true);
    expect((evento as any).event_id.equals(waitingList.event_id)).toBe(true);
    expect((evento as any).section_id.equals(waitingList.section_id)).toBe(
      true,
    );
    expect((evento as any).spot_id.equals(spot_id)).toBe(true);
  });

  test('4. offerSpotToNext com fila vazia não faz nada e não registra evento', () => {
    const waitingList = makeWaitingList();

    const promovida = waitingList.offerSpotToNext({
      spot_id: new EventSpotId(),
    });

    expect(promovida).toBeNull();
    expect(
      eventosDoTipo(waitingList, 'SpotOfferedToWaitingCustomer'),
    ).toHaveLength(0);
  });

  test('5. a segunda oferta promove a posição 2, não a 1 já notificada', () => {
    const waitingList = makeWaitingList();
    const primeiro = new CustomerId();
    const segundo = new CustomerId();

    const entradaDoPrimeiro = waitingList.join({ customer_id: primeiro });
    const entradaDoSegundo = waitingList.join({ customer_id: segundo });

    waitingList.offerSpotToNext({ spot_id: new EventSpotId() });
    const promovida = waitingList.offerSpotToNext({
      spot_id: new EventSpotId(),
    });

    expect(promovida.id.equals(entradaDoSegundo.id)).toBe(true);
    expect(promovida.position).toBe(2);
    expect(entradaDoPrimeiro.status).toBe(WaitingListEntryStatus.NOTIFIED);
    expect(
      eventosDoTipo(waitingList, 'SpotOfferedToWaitingCustomer'),
    ).toHaveLength(2);
  });

  test('6. cliente já NOTIFIED pode entrar de novo, criando uma nova entrada PENDING', () => {
    const waitingList = makeWaitingList();
    const customer_id = new CustomerId();

    waitingList.join({ customer_id });
    waitingList.offerSpotToNext({ spot_id: new EventSpotId() });

    const novaEntrada = waitingList.join({ customer_id });

    expect(novaEntrada.status).toBe(WaitingListEntryStatus.PENDING);
    expect(novaEntrada.position).toBe(2);
    expect(waitingList.entries.size).toBe(2);
  });

  test('7. os nomes de classe dos eventos são os usados no despacho', () => {
    const waitingList = makeWaitingList();

    waitingList.join({ customer_id: new CustomerId() });
    waitingList.offerSpotToNext({ spot_id: new EventSpotId() });

    const nomes = [...waitingList.events].map((e) => e.constructor.name);

    expect(nomes).toEqual([
      'CustomerJoinedWaitingList',
      'SpotOfferedToWaitingCustomer',
    ]);
  });
});
