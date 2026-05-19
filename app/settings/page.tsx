import { EndpointSettings } from '@/components/floci/endpoint-settings';

export default function SettingsPage() {
  return (
    <section className='mx-auto w-full max-w-2xl p-6'>
      <h1 className='mb-4 text-2xl font-bold'>Settings</h1>
      <EndpointSettings />
    </section>
  );
}
