export type ElementStatus = 'implemented' | 'planned';

export type FlociElement = {
  slug: string;
  label: string;
  description: string;
  status: ElementStatus;
};

export const FLOCI_ELEMENTS: FlociElement[] = [
  {
    slug: 'sqs',
    label: 'SQS',
    description: 'Queue operations, message inspection, and timed polling.',
    status: 'implemented',
  },
  {
    slug: 's3',
    label: 'S3',
    description: 'Bucket navigation, object actions, and path-aware search.',
    status: 'implemented',
  },
  {
    slug: 'sns',
    label: 'SNS',
    description: 'Topics, subscriptions, and publish workflows.',
    status: 'implemented',
  },
  {
    slug: 'dynamodb',
    label: 'DynamoDB',
    description: 'Table and item exploration for local datasets.',
    status: 'implemented',
  },
  {
    slug: 'lambda',
    label: 'Lambda',
    description: 'Function inventory and test invoke flow.',
    status: 'implemented',
  },
  {
    slug: 'eventbridge',
    label: 'EventBridge',
    description: 'Event buses, rules, and target diagnostics.',
    status: 'implemented',
  },
  {
    slug: 'step-functions',
    label: 'Step Functions',
    description: 'State machine and execution tracking.',
    status: 'implemented',
  },
  {
    slug: 'ssm',
    label: 'SSM Parameter Store',
    description: 'Parameter browse and mutation workflows.',
    status: 'implemented',
  },
  {
    slug: 'secrets-manager',
    label: 'Secrets Manager',
    description: 'Secret version visibility and updates.',
    status: 'implemented',
  },
  {
    slug: 'cloudwatch',
    label: 'CloudWatch Logs',
    description: 'Log groups, streams, and filtered tailing.',
    status: 'implemented',
  },
];

export function getElementBySlug(slug: string): FlociElement | undefined {
  return FLOCI_ELEMENTS.find((element) => element.slug === slug);
}
