export const dynamic = 'force-dynamic';

import CloudWatchPage from '@/components/floci/cloudwatch';
import { createServicePage } from '@/lib/floci/create-service-page';

export default createServicePage(CloudWatchPage);
