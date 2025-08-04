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

    // Check if the original method is async by calling it with no args and checking if it returns a Promise
    const isAsync = originalMethod.constructor.name === 'AsyncFunction';

    if (isAsync) {
      // Handle async methods
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
    } else {
      // Handle sync methods
      descriptor.value = function (...args: any[]) {
        const tracer = trace.getTracer('openmeet-api');
        const spanName = `${className}.${methodName}`;

        return tracer.startActiveSpan(spanName, (span) => {
          try {
            // Add tenant ID if available
            if (this.tenantId) {
              span.setAttribute('tenant.id', this.tenantId);
            }

            const result = originalMethod.apply(this, args);
            return result;
          } catch (error) {
            span.recordException(error);
            throw error;
          } finally {
            span.end();
          }
        });
      };
    }

    return descriptor;
  };
}
