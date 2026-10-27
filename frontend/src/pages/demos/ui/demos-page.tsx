import { DemoUpload } from '@/features/demo-upload'
import { DemoList } from '@/widgets/demo-list'

export function DemosPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Демки CS2</h1>
        <p className="text-sm text-muted-foreground">
          Загрузите демо вручную: файл обрабатывается на сервере (demoparser2), затем открывается разбор с таймлайном, хайлайтами и выводами.
        </p>
      </div>
      <DemoUpload />
      <DemoList />
    </div>
  )
}
