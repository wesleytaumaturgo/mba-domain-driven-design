import { Entity } from '../../../common/domain/entity';
import Uuid from '../../../common/domain/value-objects/uuid.vo';
import { CustomerId } from './customer.entity';

export class WaitingListEntryId extends Uuid {}

export enum WaitingListEntryStatus {
  PENDING,
  NOTIFIED,
}

export type WaitingListEntryCreateCommand = {
  customer_id: CustomerId | string;
  position: number;
};

export type WaitingListEntryConstructorProps = {
  id?: WaitingListEntryId | string;
  customer_id: CustomerId | string;
  status: WaitingListEntryStatus;
  position: number;
};

export class WaitingListEntry extends Entity {
  id: WaitingListEntryId;
  customer_id: CustomerId;
  status: WaitingListEntryStatus;
  position: number;

  constructor(props: WaitingListEntryConstructorProps) {
    super();
    this.id =
      typeof props.id === 'string'
        ? new WaitingListEntryId(props.id)
        : props.id ?? new WaitingListEntryId();
    this.customer_id =
      props.customer_id instanceof CustomerId
        ? props.customer_id
        : new CustomerId(props.customer_id);
    this.status = props.status;
    this.position = props.position;
  }

  static create(command: WaitingListEntryCreateCommand) {
    return new WaitingListEntry({
      customer_id: command.customer_id,
      position: command.position,
      status: WaitingListEntryStatus.PENDING,
    });
  }

  markAsNotified() {
    this.status = WaitingListEntryStatus.NOTIFIED;
  }

  isPending() {
    return this.status === WaitingListEntryStatus.PENDING;
  }

  toJSON() {
    return {
      id: this.id.value,
      customer_id: this.customer_id.value,
      status: WaitingListEntryStatus[this.status],
      position: this.position,
    };
  }
}
