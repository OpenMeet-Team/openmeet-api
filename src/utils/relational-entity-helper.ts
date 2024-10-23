import { Expose, instanceToPlain } from 'class-transformer';
import {
  AfterLoad,
  BaseEntity,
  BeforeInsert,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { ulid } from 'ulid';

export class EntityRelationalHelper extends BaseEntity {
  __entity?: string;

  @Column({ type: String, nullable: true })
  @Expose()
  shortId: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @AfterLoad()
  setEntityName() {
    this.__entity = this.constructor.name;
  }

  @BeforeInsert()
  generateShortId() {
    this.shortId = ulid().toLowerCase();
  }

  toJSON() {
    return instanceToPlain(this);
  }
}
