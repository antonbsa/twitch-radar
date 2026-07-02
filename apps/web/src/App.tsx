import { Navigate, Route, Routes } from "react-router"
import { AuthGate } from "@/routes/auth-gate"
import { AuthenticatedLayout } from "@/routes/authenticated-layout"
import { LoginPage } from "@/routes/login"
import { ChannelsPage } from "@/routes/channels"
import { AlertsPage } from "@/routes/alerts"
import { AccountPage } from "@/routes/account"

export function App() {
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
