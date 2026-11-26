import { DemoUpload } from '@/features/demo-upload'
import { PageHeader } from '@/shared/ui'
import { DemoList } from '@/widgets/demo-list'

export function DemosPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Демки">Разбор раундов, хайлайты и выводы по вашим демкам.</PageHeader>
      <DemoUpload />
      <DemoList />
    </div>
  )
}
