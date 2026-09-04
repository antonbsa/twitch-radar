import { NavLink } from "react-router"
import { Radio, Bell, User } from "lucide-react"
import { useLanguage } from "@/context/language-context"
import { cn } from "@/lib/utils"

const tabs = [
  { to: "/channels", labelKey: "nav.channels", icon: Radio },
  { to: "/alerts", labelKey: "nav.alerts", icon: Bell },
  { to: "/account", labelKey: "nav.account", icon: User },
]

export function BottomTabBar() {
  const { t } = useLanguage()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-background">
      {tabs.map(({ to, labelKey, icon: Icon }) => (
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
          {t(labelKey)}
        </NavLink>
      ))}
    </nav>
  )
}
