import { ApplicationService } from '../../common/application/application.service';
import { EventSectionId } from '../domain/entities/event-section';
import { EventId } from '../domain/entities/event.entity';
import { WaitingList } from '../domain/entities/waiting-list.entity';
import { ICustomerRepository } from '../domain/repositories/customer-repository.interface';
import { IEventRepository } from '../domain/repositories/event-repository.interface';
import { IWaitingListRepository } from '../domain/repositories/waiting-list-repository.interface';

export class WaitingListService {
  constructor(
    private waitingListRepo: IWaitingListRepository,
    private eventRepo: IEventRepository,
    private customerRepo: ICustomerRepository,
    private applicationService: ApplicationService,
  ) {}

  async join(input: {
    event_id: string;
    section_id: string;
    customer_id: string;
  }) {
    return this.applicationService.run(async () => {
      const customer = await this.customerRepo.findById(input.customer_id);

      if (!customer) {
        throw new Error('Customer not found');
      }

      const event = await this.eventRepo.findById(input.event_id);

      if (!event) {
        throw new Error('Event not found');
      }

      const sectionId = new EventSectionId(input.section_id);
      const section = event.sections.find((s) => s.id.equals(sectionId));

      if (!section) {
        throw new Error('Section not found');
      }

      if (!section.isSoldOut()) {
        throw new Error('Section is not sold out');
      }

      let waitingList = await this.waitingListRepo.findByEventAndSection(
        event.id,
        sectionId,
      );

      if (!waitingList) {
        waitingList = WaitingList.create({
          event_id: event.id,
          section_id: sectionId,
        });
      }

      waitingList.join({ customer_id: customer.id });

      await this.waitingListRepo.add(waitingList);

      return waitingList;
    });
  }

  async list(input: { event_id: string; section_id: string }) {
    const waitingList = await this.waitingListRepo.findByEventAndSection(
      new EventId(input.event_id),
      new EventSectionId(input.section_id),
    );

    if (!waitingList) {
      return [];
    }

    return waitingList.toJSON().entries;
  }
}
