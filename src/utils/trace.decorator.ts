import { trace } from '@opentelemetry/api';

export function Trace(name?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;
    const className = target.constructor.name;
    const methodName = name || propertyKey;

    descriptor.value = async function (...args: any[]) {
      const tracer = trace.getTracer('openmeet-api');
      const spanName = `${className}.${methodName}`;

      return await tracer.startActiveSpan(spanName, async (span) => {
        try {
          // Add tenant ID if available
          if (this.tenantId) {
            span.setAttribute('tenant.id', this.tenantId);
          }

          const result = await originalMethod.apply(this, args);
          return result;
        } catch (error) {
          span.recordException(error);
          throw error;
        } finally {
          span.end();
        }
      });
    };

    return descriptor;
  };
}
