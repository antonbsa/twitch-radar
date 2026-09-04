import { useEffect } from "react"
import { Navigate, Route, Routes } from "react-router"
import { AuthGate } from "@/components/auth-gate"
import { AuthenticatedLayout } from "@/layouts/authenticated-layout"
import { useAuth } from "@/context/auth-context"
import { useLanguage } from "@/context/language-context"
import { LoginPage } from "@/routes/login"
import { ChannelsPage } from "@/routes/channels"
import { AlertsPage } from "@/routes/alerts"
import { AccountPage } from "@/routes/account"

// Reconciles the client-guessed language (localStorage/navigator, set before
// any user is known) with the authoritative server-side preference once
// GET /api/me resolves (ADR 0044). adoptLanguage does not re-PATCH the value
// it just received.
function useSyncLanguageWithUser() {
  const { user } = useAuth()
  const { adoptLanguage } = useLanguage()
  useEffect(() => {
    if (user?.language) adoptLanguage(user.language)
  }, [user?.language, adoptLanguage])
}

export function App() {
  useSyncLanguageWithUser()

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/channels" replace />} />
      <Route
        path="/login"
        element={
          <AuthGate when="guest" redirectTo="/channels">
            <LoginPage />
          </AuthGate>
        }
      />
      <Route
        element={
          <AuthGate when="authenticated" redirectTo="/login">
            <AuthenticatedLayout />
          </AuthGate>
        }
      >
        <Route path="/channels" element={<ChannelsPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/account" element={<AccountPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
