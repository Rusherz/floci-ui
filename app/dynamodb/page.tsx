export const dynamic = 'force-dynamic';

import DynamoDbPage from '@/components/floci/dynamodb';
import { createServicePage } from '@/lib/floci/create-service-page';

export default createServicePage(DynamoDbPage);
