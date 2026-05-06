import { HomePage } from '@/components/floci/home-page';
import { getEnabledElements } from '@/lib/floci/elements';

export default function Page() {
  const enabledElements = getEnabledElements();
  return <HomePage enabledElements={enabledElements} />;
}
