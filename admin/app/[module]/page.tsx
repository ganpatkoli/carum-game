import { MODULES } from '../../../backend/src/admin/rbac';

export function generateStaticParams() { return MODULES.map((module) => ({ module })); }
export const dynamicParams = false;

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold capitalize">{module.replace(/_/g, ' ')}</h1>
      <p className="text-slate-400">Module scaffold. Data screens attach to the matching authenticated admin API.</p>
    </div>
  );
}
