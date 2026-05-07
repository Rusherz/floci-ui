export const dynamic = 'force-dynamic';

import { SqsOpsPage } from '@/components/floci/sqs';
import { createServicePage } from '@/lib/floci/create-service-page';

export default createServicePage(SqsOpsPage);
