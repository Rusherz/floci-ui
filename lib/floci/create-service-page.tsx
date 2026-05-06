import type { ComponentType } from 'react';

export function createServicePage(Component: ComponentType) {
  return function ServicePage() {
    return <Component />;
  };
}
