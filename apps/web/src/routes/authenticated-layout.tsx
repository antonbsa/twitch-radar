import { Outlet } from "react-router"
import { BottomTabBar } from "@/components/bottom-tab-bar"

export function AuthenticatedLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1 overflow-y-auto pb-16">
        <Outlet />
      </main>
      <BottomTabBar />
    </div>
  )
}
