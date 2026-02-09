import { Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import LoginPage from "./pages/LoginPage";
import RegistrationPage from "./pages/RegistrationPage";
import UserDashboard from "./pages/UserDashboard";
import SecretaryDashboard from "./pages/SecretaryDashboard";
import TechnicianDashboard from "./pages/TechnicianDashboard";
import DSIDashboard from "./pages/DSIDashboard";

function App() {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem("token");
    } catch {
      return null;
    }
  });
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (token) {
        localStorage.setItem("token", token);
        // Récupérer le rôle depuis localStorage
        const role = localStorage.getItem("userRole");
        setUserRole(role);
        
        // Si pas de rôle en localStorage, le récupérer depuis l'API
        if (!role) {
          fetch("http://localhost:8000/auth/me", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          })
            .then((res) => res.json())
            .then((userData) => {
              if (userData.role && userData.role.name) {
                localStorage.setItem("userRole", userData.role.name);
                setUserRole(userData.role.name);
              }
            })
            .catch((err) => console.error("Erreur récupération rôle:", err));
        }
      } else {
        localStorage.removeItem("token");
        localStorage.removeItem("userRole");
        setUserRole(null);
      }
    } catch (err) {
      console.error("Erreur localStorage:", err);
    }
  }, [token]);

  // Fonction pour déterminer le dashboard selon le rôle
  function getDashboard() {
    if (!token) return <Navigate to="/" replace />;
    
    switch (userRole) {
      case "Secrétaire DSI":
        return <Navigate to="/dashboard/secretary" replace />;
      case "Adjoint DSI":
        return <Navigate to="/dashboard/adjoint" replace />;
      case "Technicien":
        return <Navigate to="/dashboard/techniciens" replace />;
      case "Admin":
        return <Navigate to="/dashboard/admin" replace />;
      case "DSI":
        return <Navigate to="/dashboard/dsi" replace />;
      case "Utilisateur":
      default:
        return <Navigate to="/dashboard/user" replace />;
    }
  }

  return (
    <div>
      <Routes>
        <Route path="/" element={<LoginPage onLogin={setToken} />} />
        <Route path="/login" element={<LoginPage onLogin={setToken} />} />
        <Route path="/inscription" element={<RegistrationPage />} />
        <Route path="/dashboard" element={getDashboard()} />
        <Route
          path="/dashboard/user"
          element={token ? <UserDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/user/tickets"
          element={token ? <UserDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/user/notifications"
          element={token ? <UserDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/secretary"
          element={token ? <SecretaryDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/adjoint"
          element={token ? <SecretaryDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/adjoint/tickets"
          element={token ? <SecretaryDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/adjoint/actifs"
          element={token ? <SecretaryDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/adjoint/types"
          element={token ? <SecretaryDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/adjoint/categories"
          element={token ? <SecretaryDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/adjoint/technicians"
          element={token ? <SecretaryDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/adjoint/statistics"
          element={token ? <SecretaryDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/adjoint/notifications"
          element={token ? <SecretaryDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/techniciens"
          element={token ? <TechnicianDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/techniciens/ticketsencours"
          element={token ? <TechnicianDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/techniciens/ticketsresolus"
          element={token ? <TechnicianDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/techniciens/ticketsrejetes"
          element={token ? <TechnicianDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/techniciens/actifs"
          element={token ? <TechnicianDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/techniciens/notifications"
          element={token ? <TechnicianDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/dsi"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/dsi/tickets"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/dsi/technicians"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/dsi/types"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/dsi/categories"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/dsi/users"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/dsi/reports"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/dsi/maintenance"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/dsi/audit-logs"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/dsi/notifications"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/admin"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/admin/tickets"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/admin/actifs"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/admin/types"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/admin/categories"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/admin/technicians"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/admin/users"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/admin/roles"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/admin/groupes"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/admin/statistiques"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/admin/reports"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/admin/maintenance"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/admin/audit-et-logs"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/admin/audit-logs"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/admin/parametres"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/admin/parametres/apparence"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/admin/parametres/email"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/admin/parametres/securite"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/admin/parametres/types-de-tickets"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/admin/parametres/priorites"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/admin/parametres/departements"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dashboard/admin/notifications"
          element={token ? <DSIDashboard token={token} /> : <Navigate to="/" replace />}
        />
      </Routes>
    </div>
  );
}

export default App;
