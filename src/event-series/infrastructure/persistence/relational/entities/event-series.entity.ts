import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  OneToMany,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  BeforeInsert,
} from 'typeorm';
import { EntityRelationalHelper } from '../../../../../utils/relational-entity-helper';
import { UserEntity } from '../../../../../user/infrastructure/persistence/relational/entities/user.entity';
import { GroupEntity } from '../../../../../group/infrastructure/persistence/relational/entities/group.entity';
import { FileEntity } from '../../../../../file/infrastructure/persistence/relational/entities/file.entity';
import { EventEntity } from '../../../../../event/infrastructure/persistence/relational/entities/event.entity';
import { ulid } from 'ulid';
import slugify from 'slugify';
import { generateShortCode } from '../../../../../utils/short-code';
import { SourceFields } from '../../../../../core/interfaces/source-data.interface';
import { ApiProperty } from '@nestjs/swagger';

@Entity({ name: 'eventSeries' })
export class EventSeriesEntity
  extends EntityRelationalHelper
  implements SourceFields
{
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ type: 'char', length: 26, unique: true })
  @Index()
  ulid: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  @Index()
  slug: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, default: 'UTC' })
  timeZone: string;

  @ApiProperty({
    type: () => FileEntity,
  })
  @OneToOne(() => FileEntity, {
    eager: true,
  })
  @JoinColumn({ name: 'imageId' })
  image?: FileEntity;

  @Column({ nullable: false, type: 'jsonb' })
  recurrenceRule: Record<string, any>;

  @Column({ nullable: true, type: 'jsonb' })
  recurrenceExceptions: string[];

  @Column({ type: 'varchar', length: 255, nullable: true })
  matrixRoomId: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @ManyToOne(() => GroupEntity, { nullable: true })
  @JoinColumn({ name: 'groupId' })
  group?: GroupEntity | null;

  @OneToMany(() => EventEntity, (event) => event.series, {
    cascade: ['update'],
  })
  events: EventEntity[];

  // External source fields
  @Column({ type: 'varchar', length: 50, nullable: true })
  sourceType: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  sourceId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  sourceUrl: string | null;

  @Column({ type: 'jsonb', nullable: true })
  sourceData: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  templateEventSlug: string;

  @OneToOne(() => EventEntity, { nullable: true })
  @JoinColumn({ name: 'templateEventSlug', referencedColumnName: 'slug' })
  templateEvent: EventEntity;

  // Human-readable description of recurrence pattern (virtual field)
  recurrenceDescription?: string;

  @BeforeInsert()
  generateUlid() {
    if (!this.ulid) {
      this.ulid = ulid().toLowerCase();
    }
  }

  @BeforeInsert()
  generateSlug() {
    if (!this.slug) {
      this.slug = `${slugify(
        this.name + '-' + generateShortCode().toLowerCase(),
        {
          strict: true,
          lower: true,
        },
      )}`;
    }
  }
}
