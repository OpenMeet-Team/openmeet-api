import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  BeforeInsert,
  JoinColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { CalendarSourceEntity } from '../../../../../calendar-source/infrastructure/persistence/relational/entities/calendar-source.entity';
import { ulid } from 'ulid';

@Entity({
  name: 'externalEvents',
})
@Index('idx_external_events_source_time', [
  'calendarSource',
  'startTime',
  'endTime',
])
export class ExternalEventEntity extends EntityRelationalHelper {
  @ApiProperty({
    type: Number,
  })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({
    type: String,
  })
  @Column({ type: 'varchar', length: 26, unique: true })
  ulid: string;

  @ApiProperty({
    type: String,
  })
  @Column({ type: 'varchar', length: 255 })
  externalId: string;

  @ApiProperty({
    type: String,
  })
  @Column({ type: 'text', nullable: true })
  summary?: string;

  @ApiProperty({
    type: Date,
  })
  @Column({ type: 'timestamp with time zone' })
  startTime: Date;

  @ApiProperty({
    type: Date,
  })
  @Column({ type: 'timestamp with time zone' })
  endTime: Date;

  @ApiProperty({
    type: Boolean,
  })
  @Column({ type: 'boolean', default: false })
  isAllDay: boolean;

  @ApiProperty({
    type: String,
    enum: ['busy', 'free', 'tentative'],
  })
  @Column({
    type: 'varchar',
    length: 20,
    default: 'busy',
    enum: ['busy', 'free', 'tentative'],
  })
  status: 'busy' | 'free' | 'tentative';

  @ApiProperty({
    type: String,
    nullable: true,
  })
  @Column({ type: 'text', nullable: true })
  location?: string;

  @ApiProperty({
    type: String,
    nullable: true,
  })
  @Column({ type: 'text', nullable: true })
  description?: string;

  @ApiProperty({
    type: () => CalendarSourceEntity,
  })
  @ManyToOne(() => CalendarSourceEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'calendarSourceId' })
  calendarSource?: CalendarSourceEntity;

  @ApiProperty({
    type: Number,
  })
  @Column()
  calendarSourceId: number;

  @ApiProperty({
    type: Date,
  })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({
    type: Date,
  })
  @UpdateDateColumn()
  updatedAt: Date;

  @BeforeInsert()
  generateUlid() {
    if (!this.ulid) {
      this.ulid = ulid();
    }
  }
}
