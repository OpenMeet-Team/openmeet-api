import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateHandleDto } from './update-handle.dto';

describe('UpdateHandleDto', () => {
  async function validateDto(data: Partial<UpdateHandleDto>) {
    const dto = plainToInstance(UpdateHandleDto, data);
    return validate(dto);
  }

  it('should accept a valid handle', async () => {
    const errors = await validateDto({ handle: 'alice.opnmt.me' });
    expect(errors).toHaveLength(0);
  });

  it('should accept a handle with subdomains', async () => {
    const errors = await validateDto({ handle: 'alice.sub.opnmt.me' });
    expect(errors).toHaveLength(0);
  });

  it('should reject a handle without a dot', async () => {
    const errors = await validateDto({ handle: 'alice' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject an empty string', async () => {
    const errors = await validateDto({ handle: '' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject a handle with spaces', async () => {
    const errors = await validateDto({ handle: 'alice .opnmt.me' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject a handle starting with a dot', async () => {
    const errors = await validateDto({ handle: '.alice.opnmt.me' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject a handle ending with a dot', async () => {
    const errors = await validateDto({ handle: 'alice.opnmt.me.' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject a handle with special characters', async () => {
    const errors = await validateDto({ handle: 'al!ce.opnmt.me' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject a handle that is too short', async () => {
    const errors = await validateDto({ handle: 'ab' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept a handle with hyphens', async () => {
    const errors = await validateDto({ handle: 'alice-bob.opnmt.me' });
    expect(errors).toHaveLength(0);
  });

  it('should reject a handle with a segment starting with hyphen', async () => {
    const errors = await validateDto({ handle: '-alice.opnmt.me' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject a handle with a segment ending with hyphen', async () => {
    const errors = await validateDto({ handle: 'alice-.opnmt.me' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
