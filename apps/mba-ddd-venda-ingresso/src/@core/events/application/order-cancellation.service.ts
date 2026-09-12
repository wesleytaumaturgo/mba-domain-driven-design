import { ApplicationService } from '../../common/application/application.service';
import { IOrderRepository } from '../domain/repositories/order-repository.interface';

export class OrderCancellationService {
  constructor(
    private orderRepo: IOrderRepository,
    private applicationService: ApplicationService,
  ) {}

  // `event_id` vem da rota aninhada; o agregado Order não guarda o evento
  // (só `event_spot_id`), então não há o que conferir contra ele aqui.
  async cancel(input: { event_id: string; order_id: string }) {
    return this.applicationService.run(async () => {
      const order = await this.orderRepo.findById(input.order_id);

      if (!order) {
        throw new Error('Order not found');
      }

      order.cancel();

      await this.orderRepo.add(order);
      return order;
    });
  }
}
