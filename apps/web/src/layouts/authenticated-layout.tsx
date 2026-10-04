import { Outlet } from "react-router"
import { BottomTabBar } from "@/components/bottom-tab-bar"
import { useAutoSyncFollows } from "@/hooks/use-channels"

export function AuthenticatedLayout() {
  useAutoSyncFollows()

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      <BottomTabBar />
    </div>
  )
}
