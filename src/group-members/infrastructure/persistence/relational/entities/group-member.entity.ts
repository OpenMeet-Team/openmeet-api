import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { EntityRelationalHelper } from "../../../../../utils/relational-entity-helper";
import { GroupEntity } from "../../../../../groups/infrastructure/persistence/relational/entities/group.entity";

@Entity({name: 'groupMember'})
export class GroupMemberEntity extends EntityRelationalHelper{
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar' })
    name: string;

    @ManyToOne(()=> GroupEntity, group => group.groupMembers)
    @JoinColumn()
    group: GroupEntity;

}