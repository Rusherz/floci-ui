export const dynamic = 'force-dynamic';

import { S3OpsPage } from '@/components/floci/s3';
import { createServicePage } from '@/lib/floci/create-service-page';

export default createServicePage(S3OpsPage);
