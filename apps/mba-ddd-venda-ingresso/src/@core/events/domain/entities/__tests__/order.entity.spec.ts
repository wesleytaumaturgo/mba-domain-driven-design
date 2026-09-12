import { CustomerId } from '../customer.entity';
import { EventSpotId } from '../event-spot';
import { Order, OrderStatus } from '../order.entity';

function makeOrder() {
  return Order.create({
    customer_id: new CustomerId(),
    amount: 200,
    event_spot_id: new EventSpotId(),
  });
}

describe('Order Entity Unit Tests', () => {
  test('deve cancelar um pedido e registrar o OrderCancelled', () => {
    const order = makeOrder();
    order.cancel();

    expect(order.status).toBe(OrderStatus.CANCELLED);

    const events = [...order.events];
    const cancelled = events[events.length - 1];

    expect(cancelled.constructor.name).toBe('OrderCancelled');
    expect((cancelled as any).aggregate_id.equals(order.id)).toBe(true);
    expect((cancelled as any).status).toBe(OrderStatus.CANCELLED);
    expect((cancelled as any).event_spot_id.equals(order.event_spot_id)).toBe(
      true,
    );
  });

  test('deve cancelar um pedido pago', () => {
    const order = makeOrder();
    order.pay();
    order.cancel();

    expect(order.status).toBe(OrderStatus.CANCELLED);
  });

  test('não deve cancelar um pedido já cancelado', () => {
    const order = makeOrder();
    order.cancel();

    expect(() => order.cancel()).toThrow('Order already cancelled');
  });

  test('não deve registrar um segundo OrderCancelled ao tentar cancelar de novo', () => {
    const order = makeOrder();
    order.cancel();

    try {
      order.cancel();
    } catch (e) {
      // esperado
    }

    const cancelados = [...order.events].filter(
      (e) => e.constructor.name === 'OrderCancelled',
    );
    expect(cancelados).toHaveLength(1);
  });

  test('toJSON deve expor o status legível', () => {
    const order = makeOrder();
    expect(order.toJSON().status).toBe('PENDING');

    order.cancel();
    expect(order.toJSON().status).toBe('CANCELLED');
  });
});
