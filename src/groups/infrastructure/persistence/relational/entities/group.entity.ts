import { Column, Entity, JoinTable, ManyToMany, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { EntityRelationalHelper } from "../../../../../utils/relational-entity-helper";
import { CategoryEntity } from "../../../../../categories/infrastructure/persistence/relational/entities/categories.entity";
import { GroupStatus } from "../../../../../core/constants/constant";
import { EventEntity } from "../../../../../events/infrastructure/persistence/relational/entities/events.entity";
import { GroupMemberEntity } from "../../../../../group-members/infrastructure/persistence/relational/entities/group-member.entity";

@Entity({ name: 'Group' })
export class GroupEntity extends EntityRelationalHelper {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

    @Column({ type: 'varchar', length: 255 })
    slug: string;

    @Column({ type: 'text' })
    description: string;

    @Column({ type: 'boolean', default: false })
    approved: boolean;

    @Column({
        nullable: true,
        type: 'enum',
        enum: GroupStatus,
      })
      status: GroupStatus;
    
    @OneToMany(()=> EventEntity, event => event.group)
    events: EventEntity[];

    @OneToMany(()=> GroupMemberEntity, gm=>gm.group)
    groupMembers: GroupMemberEntity[];

    @ManyToMany(()=> CategoryEntity, category => category.groups)
    @JoinTable()
    categories: CategoryEntity[];
}
