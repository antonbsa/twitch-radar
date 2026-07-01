import { NavLink } from "react-router"
import { Radio, Bell, User } from "lucide-react"
import { cn } from "@/lib/utils"

const tabs = [
  { to: "/channels", label: "Channels", icon: Radio },
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/account", label: "Account", icon: User },
]

export function BottomTabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-background">
      {tabs.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs",
              isActive ? "text-primary" : "text-muted-foreground",
            )
          }
        >
          <Icon className="size-5" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
