import { AggregateRoot } from '../../../common/domain/aggregate-root';
import {
  AnyCollection,
  ICollection,
  MyCollectionFactory,
} from '../../../common/domain/my-collection';
import Uuid from '../../../common/domain/value-objects/uuid.vo';
import { CustomerJoinedWaitingList } from '../events/domain-events/customer-joined-waiting-list.event';
import { SpotOfferedToWaitingCustomer } from '../events/domain-events/spot-offered-to-waiting-customer.event';
import { CustomerId } from './customer.entity';
import { EventSectionId } from './event-section';
import { EventSpotId } from './event-spot';
import { EventId } from './event.entity';
import { WaitingListEntry } from './waiting-list-entry';

export class WaitingListId extends Uuid {}

export type WaitingListCreateCommand = {
  event_id: EventId | string;
  section_id: EventSectionId | string;
};

export type WaitingListConstructorProps = {
  id?: WaitingListId | string;
  event_id: EventId | string;
  section_id: EventSectionId | string;
};

export class WaitingList extends AggregateRoot {
  id: WaitingListId;
  event_id: EventId;
  section_id: EventSectionId;
  private _entries: ICollection<WaitingListEntry>;

  constructor(props: WaitingListConstructorProps) {
    super();
    this.id =
      typeof props.id === 'string'
        ? new WaitingListId(props.id)
        : props.id ?? new WaitingListId();
    this.event_id =
      props.event_id instanceof EventId
        ? props.event_id
        : new EventId(props.event_id);
    this.section_id =
      props.section_id instanceof EventSectionId
        ? props.section_id
        : new EventSectionId(props.section_id);
    this._entries = MyCollectionFactory.create<WaitingListEntry>(this);
  }

  static create(command: WaitingListCreateCommand) {
    return new WaitingList({
      event_id: command.event_id,
      section_id: command.section_id,
    });
  }

  join(command: { customer_id: CustomerId | string }) {
    const customer_id =
      command.customer_id instanceof CustomerId
        ? command.customer_id
        : new CustomerId(command.customer_id);

    const alreadyWaiting = this.entries.find(
      (entry) => entry.isPending() && entry.customer_id.equals(customer_id),
    );

    if (alreadyWaiting) {
      throw new Error('Customer already in waiting list');
    }

    const entry = WaitingListEntry.create({
      customer_id,
      position: this.entries.values().length + 1,
    });

    this.entries.add(entry);

    this.addEvent(
      new CustomerJoinedWaitingList(
        this.id,
        entry.id,
        customer_id,
        this.event_id,
        this.section_id,
        entry.position,
      ),
    );

    return entry;
  }

  offerSpotToNext(command: { spot_id: EventSpotId | string }) {
    const next = this.entries
      .values()
      .filter((entry) => entry.isPending())
      .sort((a, b) => a.position - b.position)[0];

    if (!next) {
      return null;
    }

    const spot_id =
      command.spot_id instanceof EventSpotId
        ? command.spot_id
        : new EventSpotId(command.spot_id);

    next.markAsNotified();

    this.addEvent(
      new SpotOfferedToWaitingCustomer(
        this.id,
        next.id,
        next.customer_id,
        this.event_id,
        this.section_id,
        spot_id,
      ),
    );

    return next;
  }

  get entries(): ICollection<WaitingListEntry> {
    return this._entries as ICollection<WaitingListEntry>;
  }

  set entries(entries: AnyCollection<WaitingListEntry>) {
    this._entries = MyCollectionFactory.createFrom<WaitingListEntry>(entries);
  }

  toJSON() {
    return {
      id: this.id.value,
      event_id: this.event_id.value,
      section_id: this.section_id.value,
      entries: this.entries
        .values()
        .sort((a, b) => a.position - b.position)
        .map((entry) => entry.toJSON()),
    };
  }
}
