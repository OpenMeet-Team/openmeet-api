export enum StatusEnum {
  'active' = 1,
  'inactive' = 2,
}

export function getStatusEnumValue(name: keyof typeof StatusEnum): number {
  return StatusEnum[name];
}
