import { Navigate, Route, Routes } from "react-router"
import { ProtectedRoute } from "@/routes/protected-route"
import { LoginRoute } from "@/routes/login-route"
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
          <LoginRoute>
            <LoginPage />
          </LoginRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <AuthenticatedLayout />
          </ProtectedRoute>
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
