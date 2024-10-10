import { instanceToPlain } from 'class-transformer';
import { AfterLoad, BaseEntity, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export class EntityRelationalHelper extends BaseEntity {
  __entity?: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @AfterLoad()
  setEntityName() {
    this.__entity = this.constructor.name;
  }

  toJSON() {
    return instanceToPlain(this);
  }
}
