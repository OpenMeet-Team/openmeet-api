import request from 'supertest';

async function getAuthToken(
  app: string,
  email: string,
  password: string,
): Promise<string> {
  const server = request.agent(app).set('x-tenant-id', '1');
  const response = await server
    .post('/api/v1/auth/email/login')
    .send({ tenant_id: 1, email, password });
  return response.body.token;
}

export { getAuthToken };
