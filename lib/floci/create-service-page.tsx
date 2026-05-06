import type { ComponentType } from 'react';
import { getEnabledElements, type FlociElement } from '@/lib/floci/elements';

type ServicePageProps = {
  enabledElements: FlociElement[];
};

export function createServicePage(Component: ComponentType<ServicePageProps>) {
  return function ServicePage() {
    const enabledElements = getEnabledElements();
    return <Component enabledElements={enabledElements} />;
  };
}
