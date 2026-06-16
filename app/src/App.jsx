import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import ErrorBoundary from "./components/ErrorBoundary";
import AppLayout from "./components/AppLayout";
import LoginPage from "./pages/LoginPage";
import InboxPage from "./pages/InboxPage";
import IdeaDetailPage from "./pages/IdeaDetailPage";
import BoardPage from "./pages/BoardPage";
import CalendarPage from "./pages/CalendarPage";
import TopicsPage from "./pages/TopicsPage";
import SettingsPage from "./pages/SettingsPage";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary dev={import.meta.env.DEV}>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route
                  element={
                    <ProtectedRoute>
                      <AppLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/inbox" element={<InboxPage />} />
                  <Route path="/inbox/:id" element={<IdeaDetailPage />} />
                  <Route path="/board" element={<BoardPage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/topics" element={<TopicsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/inbox" replace />} />
              </Routes>
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
