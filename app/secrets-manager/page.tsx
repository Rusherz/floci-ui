export const dynamic = 'force-dynamic';

import SecretsManagerPage from '@/components/floci/secrets-manager';
import { createServicePage } from '@/lib/floci/create-service-page';

export default createServicePage(SecretsManagerPage);
