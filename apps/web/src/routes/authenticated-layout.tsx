import { Outlet } from "react-router"
import { BottomTabBar } from "@/components/shell/bottom-tab-bar"
import { useAutoSyncFollows } from "@/hooks/use-channels"

export function AuthenticatedLayout() {
  useAutoSyncFollows()

  return (
    <div className="flex h-dvh flex-col">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <BottomTabBar />
    </div>
  )
}
